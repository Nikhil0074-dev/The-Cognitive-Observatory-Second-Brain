import { useEffect, useState } from 'react';
import { api } from './api';
import type { Concept, Gap, Idea, Topic } from './types';

export default function Lab({ tab }: { tab: 'ideas' | 'gaps' | 'concepts' | 'topics' }) {
  const [ideas, setIdeas] = useState<Idea[] | null>(null), [gaps, setGaps] = useState<Gap[] | null>(null), [con, setCon] = useState<Concept[] | null>(null), [top, setTop] = useState<Topic[] | null>(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const run = async () => { setErr(''); setBusy(true); try { if (tab === 'ideas') setIdeas(await api.ideas()); if (tab === 'gaps') setGaps(await api.gaps()); if (tab === 'concepts') setCon(await api.concepts()); if (tab === 'topics') setTop(await api.topics()); } catch (e: any) { setErr(/ANTHROPIC/.test(e.message) ? 'This needs ANTHROPIC_API_KEY on the backend.' : 'Could not generate right now.'); } setBusy(false); };
  useEffect(() => { run(); }, [tab]);
  if (err) return <p className="muted serif lab-msg">{err}</p>;
  if (busy) return <p className="muted serif lab-msg">Thinking…</p>;
  return (
    <div className="cards" tabIndex={0} role="region" aria-label="Insights results">
      {tab === 'ideas' && ideas?.map(i => (<div key={i.title} className="card hid lab"><span className="uv tag">IDEA</span><div className="serif head">{i.title}</div><div className="pitch">{i.pitch}</div><div className="meta">{i.combines.join(' + ')}</div></div>))}
      {tab === 'gaps' && gaps?.map(g => (<div key={g.topic} className="card gap lab"><span className="amber tag">KNOWLEDGE GAP · {g.related_to.toUpperCase()}</span><div className="serif head">{g.topic}</div><div className="pitch">{g.why}</div></div>))}
      {tab === 'concepts' && (con?.length ? con.map(c => (<div key={c.name} className="card lab concept"><div className="serif head amber">{c.name}</div><div className="meta"><span className="mono lime">{c.notes}</span> notes across <span className="mono lime">{c.clusters}</span> clusters</div><div className="dots">{Array.from({ length: c.clusters }).map((_, i) => <i key={i} />)}</div></div>)) : <p className="muted serif lab-msg">No concepts yet. Run concept extraction on the backend first.</p>)}
      {tab === 'topics' && (top?.length ? top.map(t => (<div key={t.id} className={'card lab topic' + (t.emerging ? ' emerging' : '')}><div className="row"><span className="serif head amber">{t.label}</span>{t.emerging && <span className="lime tag">EMERGING</span>}</div>
        <div className="meta"><span className="mono">{t.size}</span> notes · <span className="mono">{t.recent_count}</span> recent</div><div className="chips">{t.keywords.map(k => <span key={k.term} className="chip mono" style={{ opacity: 0.45 + k.score * 0.55 }}>{k.term}</span>)}</div></div>)) : <p className="muted serif lab-msg">No topics yet. Build clusters first (Settings).</p>)}
      {tab !== 'concepts' && tab !== 'topics' && <button className="regen" onClick={run}>Regenerate</button>}
    </div>
  );
}
