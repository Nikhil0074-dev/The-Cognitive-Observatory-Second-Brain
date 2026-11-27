import { useEffect, useRef } from 'react';
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force';
import { polygonHull } from 'd3-polygon';
import type { C, E, N } from './types';
import { navigateNodes } from './a11y';

export type Mode = 'network' | 'cluster' | 'timeline';
export const PALETTE = ['#8FB8A8', '#C9B79C', '#9AA9D6', '#D69A8F', '#A7C47F', '#B58FBF', '#7FB5C4', '#C4B07F'];
const LIME = '#D7FF64', PLASMA = '#FF4D5A', PARCH = '#E8E2D5', SAGE = '#6E7E78', AMBER = '#E9B96E';
type Props = { nodes: N[]; edges: E[]; clusters: C[]; mode: Mode; selected: string | null; highlight: Set<string>; relFilter: string; onSelect: (id: string | null) => void };
const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function Graph(props: Props) {
  const cv = useRef<HTMLCanvasElement>(null);
  const P = useRef(props); P.current = props;
  const S = useRef<any>({ nodes: [], links: [], byId: new Map(), cIndex: new Map(), tf: { k: 1, x: 0, y: 0 }, pulses: [], nbrs: new Set(), touched: false, w: 800, h: 600, timers: [] }).current;

  const target = (n: any) => {
    const k = S.cIndex.size || 1, i = S.cIndex.get(n.cluster_id) ?? 0, mode = P.current.mode;
    if (mode === 'timeline') {
      const t = S.tmin === S.tmax ? 0.5 : (+new Date(n.created_at) - S.tmin) / (S.tmax - S.tmin);
      return { x: (t - 0.5) * S.w * 0.75, y: (i - (k - 1) / 2) * Math.min(95, (S.h * 0.75) / k) };
    }
    const R = Math.min(S.w, S.h) * 0.3, a = (i / k) * Math.PI * 2 - Math.PI / 2;
    return { x: Math.cos(a) * R * 1.3, y: Math.sin(a) * R };
  };
  const fit = () => {
    if (!S.nodes.length) return;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    S.nodes.forEach((n: any) => { x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y); });
    const k = Math.min((S.w - 160) / (x1 - x0 || 1), (S.h - 230) / (y1 - y0 || 1), 1.8);
    S.tf = { k, x: (-(x0 + x1) / 2) * k, y: (-(y0 + y1) / 2) * k + 42 };
  };
  const applyMode = () => {
    const sim = S.sim; if (!sim) return; const mode = P.current.mode;
    const cfg = { network: { ls: 0.35, ld: 45, ch: -70, f: 0.04 }, cluster: { ls: 0.03, ld: 40, ch: -30, f: 0.14 }, timeline: { ls: 0, ld: 40, ch: -10, f: 0.3 } }[mode];
    sim.force('link').strength(cfg.ls).distance(cfg.ld);
    sim.force('charge').strength(cfg.ch);
    sim.force('x').x((n: any) => (mode === 'network' ? 0 : target(n).x)).strength(cfg.f);
    sim.force('y').y((n: any) => (mode === 'network' ? 0 : target(n).y)).strength(mode === 'timeline' ? 0.25 : cfg.f);
    sim.alphaTarget(mode === 'cluster' && !reduced ? 0.03 : 0).alpha(0.9).restart();
    S.touched = false; S.timers.forEach(clearTimeout);
    S.timers = [500, 1400, 2800].map(ms => setTimeout(() => !S.touched && fit(), ms));
  };

  useEffect(() => { // (re)build simulation when data changes
    const old = new Map(S.nodes.map((n: any) => [n.id, n]));
    S.nodes = props.nodes.map(n => { const o: any = old.get(n.id); return { ...n, x: o?.x ?? (Math.random() - 0.5) * 300, y: o?.y ?? (Math.random() - 0.5) * 300, vx: 0, vy: 0 }; });
    S.byId = new Map(S.nodes.map((n: any) => [n.id, n]));
    S.links = props.edges.filter(e => S.byId.has(e.source) && S.byId.has(e.target)).map(e => ({ ...e }));
    S.cIndex = new Map(props.clusters.map((c, i) => [c.id, i]));
    const ts = S.nodes.map((n: any) => +new Date(n.created_at)); S.tmin = Math.min(...ts); S.tmax = Math.max(...ts);
    S.sim?.stop();
    S.sim = forceSimulation(S.nodes).force('link', forceLink(S.links).id((d: any) => d.id)).force('charge', forceManyBody())
      .force('collide', forceCollide().radius((d: any) => 7 + d.rank * 6)).force('x', forceX()).force('y', forceY())
      .force('orbit', () => { if (P.current.mode !== 'cluster' || reduced) return; for (const n of S.nodes) { const t = target(n); n.vx += -(n.y - t.y) * 0.0012; n.vy += (n.x - t.x) * 0.0012; } });
    applyMode();
  }, [props.nodes, props.edges, props.clusters]);
  useEffect(applyMode, [props.mode]);

  useEffect(() => { // synaptic pulse: impulses travel to neighbours with a 100ms stagger
    const sel = props.selected; S.nbrs = new Set(); S.pulses = []; if (!sel) return;
    const now = performance.now(); let i = 0;
    S.links.forEach((l: any) => { const a = l.source.id ?? l.source, b = l.target.id ?? l.target; if (a === sel || b === sel) { const to = a === sel ? b : a; S.nbrs.add(to); if (!reduced) S.pulses.push({ from: sel, to, t0: now + 80 * i++ }); } });
    S.selT = now;
  }, [props.selected]);

  useEffect(() => { // canvas lifecycle: resize, render loop, input
    const c = cv.current!, ctx = c.getContext('2d')!; let raf = 0, dpr = 1;
    const resize = () => { const r = c.parentElement!.getBoundingClientRect(); dpr = devicePixelRatio || 1; S.w = r.width; S.h = r.height; c.width = r.width * dpr; c.height = r.height * dpr; c.style.width = r.width + 'px'; c.style.height = r.height + 'px'; };
    const ro = new ResizeObserver(resize); ro.observe(c.parentElement!); resize();
    const radius = (n: any) => 3 + n.rank * 6;
    const visible = (l: any) => { const f = P.current.relFilter; if (f === 'all') return true; if (f === 'CONTRADICTS') return l.type === 'CONTRADICTS'; return l.type === 'RELATED_TO' && l.source.cluster_id !== l.target.cluster_id; };
    const draw = (now: number) => {
      const { mode, selected, highlight, clusters } = P.current; const { k, x, y } = S.tf;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, S.w, S.h);
      ctx.translate(S.w / 2 + x, S.h / 2 + y); ctx.scale(k, k);
      const col = (n: any) => PALETTE[(S.cIndex.get(n.cluster_id) ?? 0) % PALETTE.length];
      if (mode === 'cluster') clusters.forEach((cl, i) => {
        const pts = S.nodes.filter((n: any) => n.cluster_id === cl.id).map((n: any) => [n.x, n.y] as [number, number]); if (pts.length < 3) return;
        const h = polygonHull(pts); if (!h) return;
        ctx.beginPath(); h.forEach((p, j) => (j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
        ctx.lineJoin = 'round'; ctx.lineWidth = 46; ctx.strokeStyle = PALETTE[i % 8] + '14'; ctx.stroke(); ctx.fillStyle = PALETTE[i % 8] + '14'; ctx.fill();
        const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, top = Math.min(...pts.map(p => p[1]));
        ctx.font = `italic ${20 / Math.max(k, 0.7)}px "Instrument Serif", serif`; ctx.fillStyle = AMBER; ctx.textAlign = 'center'; ctx.fillText(cl.label, cx, top - 30);
      });
      if (mode === 'timeline') {
        ctx.font = `${10 / k}px "IBM Plex Mono", monospace`; ctx.fillStyle = SAGE; ctx.textAlign = 'left';
        clusters.forEach((cl, i) => { const ty = target({ cluster_id: cl.id, created_at: 0 }).y; ctx.strokeStyle = '#1E2A2D'; ctx.lineWidth = 1 / k; ctx.beginPath(); ctx.moveTo(-S.w * 0.5, ty); ctx.lineTo(S.w * 0.5, ty); ctx.stroke(); ctx.font = `italic ${15 / k}px "Instrument Serif", serif`; ctx.fillStyle = AMBER; ctx.fillText(cl.label, -S.w * 0.5, ty - 8 / k); });
        ctx.font = `${10 / k}px "IBM Plex Mono", monospace`; ctx.fillStyle = SAGE;
        [S.tmin, S.tmax].forEach((t, i) => { ctx.textAlign = i ? 'right' : 'left'; ctx.fillText(new Date(t).toISOString().slice(0, 7), (i - 0.5) * S.w * 0.75, S.h * 0.42); });
      }
      const dim = highlight.size > 0, selSet = selected ? new Set([selected, ...S.nbrs]) : null;
      for (const l of S.links) {
        if (!visible(l)) continue;
        const inc = selected && (l.source.id === selected || l.target.id === selected), con = l.type === 'CONTRADICTS';
        ctx.beginPath(); ctx.moveTo(l.source.x, l.source.y); ctx.lineTo(l.target.x, l.target.y); ctx.setLineDash(con ? [5 / k, 4 / k] : []);
        ctx.strokeStyle = con ? PLASMA : inc ? LIME : SAGE; ctx.globalAlpha = con ? 0.9 : inc ? 0.85 : selSet ? 0.07 : dim ? 0.08 : 0.2 + ((l.similarity ?? 0.8) - 0.8) * 1.5; ctx.lineWidth = (inc || con ? 1.6 : 0.8) / Math.sqrt(k); ctx.stroke();
      }
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      for (const p of S.pulses) { // travelling impulse
        const t = (now - p.t0) / 700; if (t < 0 || t > 1.7) continue; const a: any = S.byId.get(p.from), b: any = S.byId.get(p.to); if (!a || !b) continue;
        if (t <= 1) { const e = 1 - Math.pow(1 - t, 3), hx = a.x + (b.x - a.x) * e, hy = a.y + (b.y - a.y) * e, tl = Math.max(0, e - 0.25);
          const g = ctx.createLinearGradient(a.x + (b.x - a.x) * tl, a.y + (b.y - a.y) * tl, hx, hy); g.addColorStop(0, LIME + '00'); g.addColorStop(1, LIME);
          ctx.strokeStyle = g; ctx.lineWidth = 2.4 / Math.sqrt(k); ctx.beginPath(); ctx.moveTo(a.x + (b.x - a.x) * tl, a.y + (b.y - a.y) * tl); ctx.lineTo(hx, hy); ctx.stroke(); }
        else { ctx.strokeStyle = LIME; ctx.globalAlpha = 1 - (t - 1) / 0.7; ctx.lineWidth = 1.5 / k; ctx.beginPath(); ctx.arc(b.x, b.y, radius(b) + 3 + (t - 1) * 16, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; }
      }
      for (const n of S.nodes) {
        const isSel = n.id === selected, hit = highlight.has(n.id); let a = 1;
        if (dim && !hit) a = 0.2; else if (selSet && !selSet.has(n.id)) a = 0.35;
        const sc = isSel ? 1.6 + 0.35 * Math.exp(-(now - S.selT) / 250) * Math.cos((now - S.selT) / 55) : 1; // spring squash/stretch
        ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(n.x, n.y, radius(n) * sc, 0, 7); ctx.fillStyle = isSel ? LIME : col(n); ctx.fill();
        if (hit) { ctx.strokeStyle = LIME; ctx.lineWidth = 1.6 / Math.sqrt(k); ctx.globalAlpha = 0.5 + 0.5 * Math.sin(now / 260); ctx.beginPath(); ctx.arc(n.x, n.y, radius(n) + 4 + 2 * Math.sin(now / 260), 0, 7); ctx.stroke(); }
        if (isSel || S.nbrs.has(n.id) || (n.rank > 0.8 && k > 0.9 && !selSet && mode === 'network') || (k > 2)) { ctx.globalAlpha = a; ctx.font = `500 ${11 / Math.sqrt(k)}px "Space Grotesk", sans-serif`; ctx.fillStyle = isSel ? LIME : PARCH; ctx.textAlign = 'center'; ctx.fillText(n.title, n.x, n.y + radius(n) + 14 / Math.sqrt(k)); }
      }
      ctx.globalAlpha = 1; raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    let down: any = null, pinch: { d: number } | null = null; const ptrs = new Map<number, { x: number; y: number }>();
    const zoomAt = (mx: number, my: number, f: number) => { const k = Math.max(0.2, Math.min(6, S.tf.k * f)), q = k / S.tf.k; S.tf = { k, x: mx - (mx - S.tf.x) * q, y: my - (my - S.tf.y) * q }; };
    const two = () => { const [a, b] = [...ptrs.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; };
    const pd = (e: PointerEvent) => {
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 2) { pinch = { d: two().d || 1 }; if (down) down.moved = true; S.touched = true; return; } // second finger: pinch/pan mode, never a click
      down = { x: e.clientX, y: e.clientY, tx: S.tf.x, ty: S.tf.y, moved: false }; c.setPointerCapture(e.pointerId);
    };
    const pm = (e: PointerEvent) => {
      if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && ptrs.size === 2) { // two fingers: zoom about their midpoint
        const t = two(), r = c.getBoundingClientRect(); zoomAt(t.cx - r.left - S.w / 2, t.cy - r.top - S.h / 2, t.d / pinch.d); pinch.d = t.d || 1; S.touched = true; return;
      }
      if (!down) return; const dx = e.clientX - down.x, dy = e.clientY - down.y; if (Math.hypot(dx, dy) > 3) { down.moved = true; S.touched = true; S.tf.x = down.tx + dx; S.tf.y = down.ty + dy; }
    };
    const pu = (e: PointerEvent) => {
      ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null;
      if (down && !down.moved && ptrs.size === 0) {
        const r = c.getBoundingClientRect(), wx = (e.clientX - r.left - S.w / 2 - S.tf.x) / S.tf.k, wy = (e.clientY - r.top - S.h / 2 - S.tf.y) / S.tf.k;
        let best: any = null, bd = Infinity; for (const n of S.nodes) { const d = Math.hypot(n.x - wx, n.y - wy); if (d < bd && d < radius(n) + 8 / S.tf.k) { bd = d; best = n; } }
        P.current.onSelect(best ? best.id : null);
      }
      if (ptrs.size === 0) down = null;
    };
    const wheel = (e: WheelEvent) => { e.preventDefault(); S.touched = true; const r = c.getBoundingClientRect(); zoomAt(e.clientX - r.left - S.w / 2, e.clientY - r.top - S.h / 2, Math.exp(-e.deltaY * 0.0012)); };
    c.addEventListener('pointerdown', pd); c.addEventListener('pointermove', pm); c.addEventListener('pointerup', pu); c.addEventListener('pointercancel', pu); c.addEventListener('wheel', wheel, { passive: false });
    return () => { cancelAnimationFrame(raf); ro.disconnect(); c.removeEventListener('pointerdown', pd); c.removeEventListener('pointermove', pm); c.removeEventListener('pointerup', pu); c.removeEventListener('pointercancel', pu); c.removeEventListener('wheel', wheel); };
  }, []);
  return <canvas ref={cv} className="graph" tabIndex={0} role="application" aria-label="Map of your notes. Use the arrow keys to move between notes, Home and End to jump, Escape to deselect." onKeyDown={e => navigateNodes(e.nativeEvent, P.current.nodes, P.current.clusters, P.current.selected, P.current.onSelect)} />;
}
