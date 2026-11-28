#!/usr/bin/env python
"""Accessibility and phone-layout audit of the demo UI (axe-core in a headless browser). Exit code 1 on any problem.
Setup:  pip install playwright && python -m playwright install chromium
        cd frontend && npm install && VITE_DEMO=true npm run build && cd ..
Run:    python3 scripts/a11y-audit.py
Covers the main view, Ask tab, Topics tab and the Settings dialog, keyboard navigation inside the map (arrows / Escape), pinch zoom; the login screen only exists in non-demo builds and is not covered.
axe finds roughly a third of real accessibility problems: it cannot judge screen-reader wording, focus order quality or colour-only meaning."""
import functools, http.server, os, socketserver, sys, threading
from playwright.sync_api import sync_playwright
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'frontend'); DIST = os.path.join(ROOT, 'dist'); AXE = os.path.join(ROOT, 'node_modules', 'axe-core', 'axe.min.js')
for f in (DIST, AXE):
    if not os.path.exists(f): sys.exit(f'missing {f}: see the setup steps at the top of this file')
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=DIST)); threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{srv.server_address[1]}'; bad = 0
def axe(pg, label):
    global bad
    pg.add_script_tag(path=AXE)
    v = pg.evaluate("axe.run(document,{resultTypes:['violations']}).then(r=>r.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,n:v.nodes.length,ex:v.nodes[0].target.join(' ').slice(0,70)})))")
    print(f'[{label}] {len(v)} violations'); bad += len(v)
    for x in v: print(f"   {x['impact']} {x['id']} x{x['n']}: {x['help']} (e.g. {x['ex']})")
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1440, 'height': 900}); pg.goto(URL); pg.wait_for_timeout(1800)
    axe(pg, 'main view')
    pg.click('.tabs button:has-text("Ask")'); pg.wait_for_timeout(300); axe(pg, 'ask tab')
    pg.click('.btabs a:has-text("topics")'); pg.wait_for_timeout(400); axe(pg, 'topics tab')
    pg.click('button.gear'); pg.wait_for_timeout(500); axe(pg, 'settings dialog')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    if pg.locator('.modal').count(): print('FAIL: Escape did not close the dialog'); bad += 1
    pg.click('.tabs button:has-text("Note")')  # the details panel (earlier steps left it on the Ask tab)
    pg.focus('canvas.graph'); pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(300)
    t1 = pg.inner_text('.right h2') if pg.locator('.right h2').count() else ''; pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(300)
    t2 = pg.inner_text('.right h2') if pg.locator('.right h2').count() else ''; pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    ok = bool(t1) and t1 != t2 and pg.locator('.right h2').count() == 0 and pg.inner_text('[role=status]') == ''
    print(f"[map keyboard] ArrowRight -> {t1!r}, ArrowRight -> {t2!r}, Escape clears: {'ok' if ok else 'FAIL'}"); bad += 0 if ok else 1
    pm = b.new_page(viewport={'width': 390, 'height': 844}); pm.goto(URL); pm.wait_for_timeout(1500)
    over = pm.evaluate('document.documentElement.scrollWidth - window.innerWidth')
    print(f'[phone 390px] horizontal overflow: {max(over, 0)} px'); bad += 1 if over > 0 else 0
    axe(pm, 'phone main view')
    # two-finger pinch must zoom exactly like the mouse wheel at the same factor (synthetic pointer events: real touch hardware is not exercised)
    FIRE = "([t, i, x, y]) => document.querySelector('canvas.graph').dispatchEvent(new PointerEvent(t,{pointerId:i,pointerType:'touch',clientX:x,clientY:y,bubbles:true,isPrimary:i===1}))"
    SNAP = "()=>{const c=document.querySelector('canvas.graph');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let a=1e9,z=-1e9,e=1e9,f=-1e9;for(let y=0;y<c.height;y+=4)for(let x=0;x<c.width;x+=4){const i=(y*c.width+x)*4;if(d[i+3]>0&&(d[i]+d[i+1]+d[i+2])>150){a=Math.min(a,x);z=Math.max(z,x);e=Math.min(e,y);f=Math.max(f,y)}}return [z-a,f-e]}"
    def fresh():
        q = b.new_page(viewport={'width': 1100, 'height': 800}); q.goto(URL); q.wait_for_timeout(3000); bx = q.locator('canvas.graph').bounding_box(); return q, bx['x'] + bx['width'] / 2, bx['y'] + bx['height'] / 2
    q, cx, cy = fresh(); q.mouse.move(cx, cy); q.mouse.wheel(0, -915); q.wait_for_timeout(500); wheel = q.evaluate(SNAP); q.close()
    q, cx, cy = fresh()
    for i, x in ((1, cx - 50), (2, cx + 50)): q.evaluate(FIRE, ['pointerdown', i, x, cy])
    for st in range(1, 11):
        for i, x in ((1, cx - 50 - st * 10), (2, cx + 50 + st * 10)): q.evaluate(FIRE, ['pointermove', i, x, cy])
    for i, x in ((1, cx - 150), (2, cx + 150)): q.evaluate(FIRE, ['pointerup', i, x, cy])
    q.wait_for_timeout(500); pinch = q.evaluate(SNAP); ok = all(abs(a - c) <= 0.15 * max(a, c, 1) for a, c in zip(pinch, wheel)) and not q.locator('.right h2').count()
    print(f"[pinch zoom] wheel x3 -> {wheel}, pinch 100->300px -> {pinch}: {'ok' if ok else 'FAIL'}"); bad += 0 if ok else 1
    b.close()
print('\nOK' if not bad else f'\n{bad} problem(s)'); sys.exit(1 if bad else 0)
