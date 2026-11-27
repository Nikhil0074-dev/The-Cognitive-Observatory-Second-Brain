import { useEffect, useMemo, useState } from 'react';
import Graph, { Mode, PALETTE } from './Graph';
import Ask from './Ask';
import Universe from './Universe';
import Flow from './Flow';
import { kb } from './a11y';
import Settings from './Settings';
import Lab from './Lab';
import { api, DEMO } from './api';
import type { C, E, Hit, N, Note, Workspace } from './types';

const fmt = (n: number | null | undefined) => (n == null ? '—' : n.toFixed(2));

function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState(''), [pw, setPw] = useState(''), [err, setErr] = useState(''), [reg, setReg] = useState(false), [needCode, setNeedCode] = useState(false), [code, setCode] = useState('');
  const go = async () => { try { await api.auth(reg ? 'register' : 'login', email, pw, code); onDone(); } catch (e: any) { if (e.mfa) setNeedCode(true); setErr(e.message); } };
  return (
    <main className="login"><div className="login-card">
      <div className="eyebrow">THE COGNITIVE OBSERVATORY</div>
      <h1 className="serif">Observe your own thoughts.</h1>
      <input placeholder="email" value={email} onChange={e => setEmail(e.target.value)} />
      <input placeholder="password (8+ chars)" type="password" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === 'Enter' && go()} />
      {needCode && <input autoFocus className="mono" maxLength={11} placeholder="authenticator or recovery code" value={code} onChange={e => setCode(e.target.value.replace(/[^0-9A-Za-z-]/g, ''))} onKeyDown={e => e.key === 'Enter' && go()} />}
      {err && <div className="err">{err}</div>}
      <button className="primary" onClick={go}>{needCode ? 'Verify' : reg ? 'Create account' : 'Enter'}</button>
      <a className="link" onClick={() => { setReg(!reg); setNeedCode(false); setErr(''); }}>{reg ? 'Have an account? Sign in' : 'New here? Create an account'}</a>
    </div></main>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(DEMO || api.hasToken());
  const [nodes, setNodes] = useState<N[]>([]), [edges, setEdges] = useState<E[]>([]), [clusters, setClusters] = useState<C[]>([]);
  const [mode, setMode] = useState<Mode | 'universe' | 'flow'>('network'), [rel, setRel] = useState('all');
  const [sel, setSel] = useState<string | null>(null), [note, setNote] = useState<Note | null>(null);
  const [q, setQ] = useState(''), [hits, setHits] = useState<Hit[] | null>(null), [pickedCluster, setPicked] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null), [evidence, setEvidence] = useState<[Note, Note] | null>(null), [gone, setGone] = useState<Set<string>>(new Set()), [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [rtab, setRtab] = useState<'note' | 'ask'>('note'), [btab, setBtab] = useState<'discoveries' | 'ideas' | 'gaps' | 'concepts' | 'topics'>('discoveries'), [askIds, setAskIds] = useState<string[]>([]), [showSettings, setShowSettings] = useState(false), [notice, setNotice] = useState('');
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]), [role, setRole] = useState('owner');
  const refreshWs = () => Promise.all([api.workspaces(), api.settings()]).then(([w, st]) => { setWorkspaces(w); setRole(st.role); }).catch(() => {});
  useEffect(() => { if (authed) refreshWs(); }, [authed]);
  const switchWs = async (id: string) => { await api.switchWorkspace(id); setSel(null); setHits(null); setPicked(null); setAskIds([]); setNote(null); setQ(''); await Promise.all([load().catch(() => {}), refreshWs()]); };
  useEffect(() => { const p = new URLSearchParams(location.search), d = p.get('drive'), o = p.get('onenote'), v = d || o, name = d ? 'Google Drive' : 'OneNote'; if (v) { setNotice(v === 'connected' ? `${name} connected. Press Sync now.` : `${name} connection failed. Try again.`); setShowSettings(true); history.replaceState({}, '', location.pathname); } }, []);

  const load = () => Promise.all([api.network(), api.clusters()]).then(([n, c]) => { setNodes(n.nodes); setEdges(n.edges); setClusters(c); });
  useEffect(() => { if (authed) load().catch(console.error); }, [authed]);
  useEffect(() => { setNote(null); if (sel) api.note(sel).then(setNote).catch(() => {}); }, [sel]);

  const nodeMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);
  const cMap = useMemo(() => new Map(clusters.map((c, i) => [c.id, { ...c, color: PALETTE[i % 8] }])), [clusters]);
  const label = (n?: N) => (n?.cluster_id && cMap.get(n.cluster_id)?.label) || 'Unclustered';
  const avg = edges.filter(e => e.type === 'RELATED_TO').reduce((a, e, _, r) => a + (e.similarity || 0) / r.length, 0);

  const highlight = useMemo(() => new Set<string>(hits ? hits.map(h => h.note_id) : pickedCluster ? nodes.filter(n => n.cluster_id === pickedCluster).map(n => n.id) : askIds), [hits, pickedCluster, nodes, askIds]);
  const related = useMemo(() => !sel ? [] : edges.filter(e => e.source === sel || e.target === sel).map(e => ({ e, n: nodeMap.get(e.source === sel ? e.target : e.source)! })).filter(x => x.n).sort((a, b) => (b.e.similarity || 0) - (a.e.similarity || 0)), [sel, edges, nodeMap]);
  const insights = useMemo(() => [
    ...edges.filter(e => e.type === 'CONTRADICTS').map(e => ({ kind: 'contradiction', e })),
    ...edges.filter(e => e.type === 'RELATED_TO' && nodeMap.get(e.source)?.cluster_id !== nodeMap.get(e.target)?.cluster_id).sort((a, b) => (b.similarity || 0) - (a.similarity || 0)).map(e => ({ kind: 'hidden', e })),
  ].map(x => ({ ...x, id: x.e.source + x.e.target })).filter(x => !gone.has(x.id)).slice(0, 8), [edges, nodeMap, gone]);

  const doSearch = async () => { setPicked(null); if (!q.trim()) return setHits(null); setHits(await api.search(q)); };
  const expand = async (id: string, a: string, b: string) => { if (open === id) return setOpen(null); setOpen(id); setEvidence(null); setEvidence(await Promise.all([api.note(a), api.note(b)]) as [Note, Note]); };
  const upload = async (f: FileList | null) => { if (!f?.length) return; setBusy(true); try { await api.upload(f); await new Promise(r => setTimeout(r, 4000)); await api.rebuild(); await load(); } finally { setBusy(false); } };

  if (!authed) return <Login onDone={() => setAuthed(true)} />;
  const selNode = sel ? nodeMap.get(sel) : null;
  const cross = related.find(r => r.n.cluster_id !== selNode?.cluster_id && r.e.type === 'RELATED_TO');
  const contra = related.find(r => r.e.type === 'CONTRADICTS');

  return (
    <div className="app">
      {showSettings && <Settings notice={notice} onClose={() => setShowSettings(false)} onChanged={() => { load().catch(() => {}); refreshWs(); }} />}
      <header className="top">
        <b>OBSERVATORY01</b><span className="live" /> <span>SYSTEM ACTIVE</span><i>|</i>
        <span><span className="mono">{nodes.length}</span> NOTES</span><i>|</i><span><span className="mono">{clusters.length}</span> CLUSTERS</span><i>|</i><span><span className="mono lime">{insights.length}</span> INSIGHTS</span>
        <span style={{ marginLeft: 'auto' }} />
        {workspaces.length > 0 && <select className="wsel" aria-label="Workspace" value={workspaces.find(w => w.current)?.id} onChange={e => switchWs(e.target.value)} title="Switch workspace">{workspaces.map(w => <option key={w.id} value={w.id}>{w.name}{w.role !== 'owner' ? ` (${w.role})` : ''}</option>)}</select>}
        <button className="gear" onClick={() => setShowSettings(true)}>Settings</button>
        {DEMO && <span className="demo">DEMO DATA</span>}
      </header>

      <aside className="left" aria-label="Search and clusters">
        <div className="searchbox"><input placeholder="Search by meaning…" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && doSearch()} />
          {hits && <button className="x" onClick={() => { setQ(''); setHits(null); }}>×</button>}</div>
        {hits ? (<>
          <div className="eyebrow">{hits.length} RESULTS · RANKED BY SIMILARITY</div>
          {hits.length === 0 && <p className="muted serif">Nothing close enough. Try different words.</p>}
          {hits.map(h => (<div key={h.note_id} className={'hit' + (sel === h.note_id ? ' on' : '')} {...kb(() => setSel(h.note_id))}>
            <div className="row"><span className="title">{h.title}</span><span className="mono lime">{fmt(h.similarity)}</span></div>
            <div className="meta"><span className="mono">{h.source}</span> · {label(nodeMap.get(h.note_id))}</div><p>{h.snippet}</p></div>))}
        </>) : (<>
          <div className="eyebrow">CLUSTERS</div>
          {clusters.map(c => (<div key={c.id} className={'cl' + (pickedCluster === c.id ? ' on' : '')} aria-pressed={pickedCluster === c.id} {...kb(() => setPicked(pickedCluster === c.id ? null : c.id))}>
            <span className="swatch" style={{ background: cMap.get(c.id)!.color }} /><span className="serif amber">{c.label}</span><span className="mono muted">{c.node_count}</span></div>))}
        </>)}
        {!DEMO && role !== 'viewer' && <label className="import">{busy ? 'Indexing…' : '+ Import notes, PDFs (scans OK), images or an Obsidian vault (.zip)'}<input type="file" multiple hidden accept=".md,.markdown,.txt,.pdf,.docx,.zip,.png,.jpg,.jpeg,.tif,.tiff,.webp" onChange={e => upload(e.target.files)} /></label>}
      </aside>

      <main className="center">
        <h1 className="sr-only">The Cognitive Observatory: your notes as a map</h1>
        <div className="sr-only" aria-live="polite" role="status">{selNode ? `Selected: ${selNode.title}, ${label(selNode)}` : ''}</div>
        <div className="hero"><div className="eyebrow">YOUR KNOWLEDGE UNIVERSE</div>
          <div className="serif big">{nodes.length} notes orbit in {clusters.length} clusters</div>
          <div className="stat"><span className="mono">{fmt(edges.length ? avg : null)}</span><span className="eyebrow">AVERAGE SIMILARITY</span></div></div>
        <div className="modes">
          {(['network', 'cluster', 'timeline', 'flow', 'universe'] as (Mode | 'universe' | 'flow')[]).map(m => <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>{m === 'universe' ? '3D universe' : m === 'flow' ? 'node map' : m}</button>)}
          <span className="sep" />
          {[['all', 'all edges'], ['hidden', 'hidden links'], ['CONTRADICTS', 'contradictions']].map(([v, l]) => <button key={v} className={rel === v ? 'on' : ''} onClick={() => setRel(v)}>{l}</button>)}
        </div>
        {mode === 'universe' ? <Universe nodes={nodes} edges={edges} clusters={clusters} selected={sel} highlight={highlight} onSelect={setSel} /> : mode === 'flow' ? <Flow nodes={nodes} edges={edges} clusters={clusters} selected={sel} highlight={highlight} relFilter={rel} onSelect={setSel} /> : <Graph nodes={nodes} edges={edges} clusters={clusters} mode={mode} selected={sel} highlight={highlight} relFilter={rel} onSelect={setSel} />}
        {nodes.length === 0 && <div className="empty serif">No notes yet. Import some to light up the sky.</div>}
      </main>

      <aside className="right" aria-label="Selected note and assistant">
        <div className="tabs">{(["note", "ask"] as const).map(t => <button key={t} className={rtab === t ? "on" : ""} onClick={() => setRtab(t)}>{t === "note" ? "Note" : "Ask"}</button>)}</div>
        {rtab === "ask" ? <Ask onCite={setSel} onAnswer={setAskIds} /> : !selNode ? <p className="serif muted big2">Select a star to read its thoughts.</p> : (<>
          <div className="eyebrow">SELECTED NOTE</div>
          <h2>{selNode.title}</h2>
          <div className="meta"><span className="mono">{selNode.source}</span> · <span className="mono">{selNode.created_at.slice(0, 10)}</span> · <span className="serif amber">{label(selNode)}</span></div>
          <p className="body">{note?.content_text?.slice(0, 380) || '…'}</p>
          {!!note?.links?.length && (<><div className="eyebrow">LINKS TO</div>{note.links.map(l => <div key={l.target} className={'rel' + (l.note_id ? '' : ' muted')} {...kb(() => { if (l.note_id) setSel(l.note_id); })}><span>[[{l.target}]]</span>{!l.note_id && <span className="mono">missing</span>}</div>)}</>)}
          {!!note?.backlinks?.length && (<><div className="eyebrow">LINKED FROM</div>{note.backlinks.map(b => <div key={b.id} className="rel" {...kb(() => setSel(b.id))}><span>{b.title}</span></div>)}</>)}
          <div className="eyebrow">RELATED THOUGHTS</div>
          {related.slice(0, 6).map(({ e, n }) => (<div key={n.id} className="rel" {...kb(() => setSel(n.id))}>
            <span className={e.type === 'CONTRADICTS' ? 'plasma' : ''}>{n.title}</span><span className="mono">{e.type === 'CONTRADICTS' ? '≠' : fmt(e.similarity)}</span></div>))}
          <div className="ai"><span className="uv">AI INSIGHT</span><p className="serif">{contra ? `This pulls against “${contra.n.title}”: ${contra.e.explanation || 'the two notes disagree.'}` : cross ? `A bridge into ${label(cross.n)}: “${cross.n.title}” shares ${fmt(cross.e.similarity)} similarity with this note.` : `Rooted in ${label(selNode)}; most strongly tied to “${related[0]?.n.title ?? 'nothing yet'}”.`}</p></div>
        </>)}
      </aside>

      <footer className="bottom">
        <div className="btabs" role="tablist" aria-label="Insights">{(["discoveries", "topics", "ideas", "gaps", "concepts"] as const).map(t => <a key={t} className={btab === t ? "on" : ""} {...kb(() => setBtab(t))} role="tab" aria-selected={btab === t}>{t}</a>)}</div>
        {btab !== "discoveries" ? <Lab tab={btab} /> : <div className="cards" tabIndex={0} role="region" aria-label="Discoveries">
          {insights.map(({ id, kind, e }) => { const a = nodeMap.get(e.source)!, b = nodeMap.get(e.target)!, c = kind === 'contradiction';
            return (<div key={id} className={`card ${c ? 'con' : 'hid'}${open === id ? ' open' : ''}`}>
              <div {...kb(() => { expand(id, a.id, b.id); setSel(a.id); })} aria-expanded={open === id}>
                <div className="row"><span className={c ? 'plasma tag' : 'uv tag'}>{accepted.has(id) ? '✓ ACCEPTED' : c ? 'CONTRADICTION' : 'HIDDEN LINK'}</span><span className="mono">{fmt(e.similarity)}</span></div>
                <div className="serif head">{label(a)} <em>↔</em> {label(b)}</div>
                <div className="meta">{a.title} · {b.title}</div></div>
              {open === id && <div className="evidence"><div className="scan" />
                {evidence ? <><p><b>{a.title}</b> — {evidence[0].content_text.slice(a.title.length + 2, a.title.length + 90)}…</p><p><b>{b.title}</b> — {evidence[1].content_text.slice(b.title.length + 2, b.title.length + 90)}…</p>
                  {e.explanation && <p className="serif">{e.explanation}</p>}</> : <p className="muted">Reading both notes…</p>}
                <div className="acts"><button className="primary" onClick={() => api.accept(a.id, b.id, c ? 'CONTRADICTS' : 'RELATED_TO').then(() => { setAccepted(new Set([...accepted, id])); setOpen(null); })}>Accept connection</button><button onClick={() => { setGone(new Set([...gone, id])); setOpen(null); }}>Dismiss</button></div></div>}
            </div>); })}
          {!insights.length && <p className="muted serif lab-msg">No discoveries yet. They appear as your notes connect.</p>}
        </div>}
      </footer>
    </div>
  );
}
