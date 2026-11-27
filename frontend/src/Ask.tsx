import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { kb } from './a11y';
import type { Citation } from './types';

type M = { role: 'user' | 'assistant'; content: string; citations?: Citation[]; related?: { note_id: string; title: string }[] };
const SUGGEST = ['How does reinforcement learning relate to decision making?', 'Which topics appear across my notes?', 'Find contradictions in my notes'];

export default function Ask({ onCite, onAnswer }: { onCite: (id: string) => void; onAnswer: (ids: string[]) => void }) {
  const [msgs, setMsgs] = useState<M[]>([]), [q, setQ] = useState(''), [busy, setBusy] = useState(false), end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [msgs, busy]);
  const send = async (text = q) => {
    if (!text.trim() || busy) return; setQ(''); setBusy(true);
    const next: M[] = [...msgs, { role: 'user', content: text }]; setMsgs(next);
    try {
      const r = await api.chat(text, msgs.map(m => ({ role: m.role, content: m.content })));
      setMsgs([...next, { role: 'assistant', content: r.answer, citations: r.citations, related: r.related_concepts }]); onAnswer(r.citations.map(c => c.note_id));
    } catch { setMsgs([...next, { role: 'assistant', content: 'Something went wrong reaching the assistant. Try again.' }]); }
    setBusy(false);
  };
  const render = (m: M) => m.content.split('\n').map((line, i) => (
    <p key={i}>{line.split(/(\[\d+\])/g).map((t, j) => { const k = /^\[(\d+)\]$/.exec(t); const c = k && m.citations?.find(x => x.n === +k[1]);
      return c ? <button key={j} className="cite" title={c.title} onClick={() => onCite(c.note_id)}>{c.n}</button> : t; })}</p>));
  return (
    <div className="chat">
      <div className="msgs">
        {msgs.length === 0 && (<><p className="serif muted big2">Ask your own notes.</p>{SUGGEST.map(s => <div key={s} className="sugg" {...kb(() => send(s))}>{s}</div>)}</>)}
        {msgs.map((m, i) => m.role === 'user' ? <div key={i} className="u">{m.content}</div> : (
          <div key={i} className="a"><span className="uv tag">ASSISTANT</span><div className="serif">{render(m)}</div>
            {!!m.citations?.length && <div className="srcs">{m.citations.map(c => <div key={c.n} {...kb(() => onCite(c.note_id))}><button className="cite">{c.n}</button>{c.title}<span className="mono">{c.similarity != null ? c.similarity.toFixed(2) : ''}</span></div>)}</div>}
            {!!m.related?.length && <div className="rl muted">ALSO NEARBY: {m.related.map(r => <a key={r.note_id} {...kb(() => onCite(r.note_id))}>{r.title}</a>)}</div>}
          </div>))}
        {busy && <div className="a"><span className="uv tag">THINKING…</span></div>}
        <div ref={end} />
      </div>
      <div className="ask-in"><input aria-label="Ask about your notes" placeholder="Ask about your notes…" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} /></div>
    </div>
  );
}
