import type { C, E, Hit, N, Note } from './types';
const DATA: [string, string, string[]][] = [
 ['Reinforcement Learning', 'An agent learns a policy by maximising cumulative reward; the hard parts are credit assignment and balancing exploration with exploitation.', ['Policy Gradient Methods','Q-Learning Basics','Reward Shaping Pitfalls','Exploration vs Exploitation','Actor-Critic Notes','Sutton & Barto Ch. 3','RLHF Overview','Multi-Armed Bandits','Temporal Difference Learning','Credit Assignment']],
 ['Behavioral Economics', 'People respond to incentives, but predictably misjudge them: framing, defaults and loss aversion shape choices more than raw payoffs.', ['Loss Aversion','Nudge Theory','Incentive Design','Hyperbolic Discounting','Anchoring Effects','Mental Accounting','Choice Architecture','Prospect Theory','Default Bias','Sunk Cost Fallacy']],
 ['Product Management', 'Products improve through tight feedback loops: measure behaviour, form a hypothesis, ship a small change, and read the metric.', ['Feedback Loops in Products','North Star Metrics','Jobs To Be Done','Roadmap Prioritization','Growth Loops','Retention Cohorts','A/B Testing Pitfalls','User Interview Notes','Pricing Experiments','Activation Funnel']],
 ['Transformers & LLMs', 'Language models map text to vectors; retrieval and tool use extend them beyond what fits in their context window.', ['Attention Is All You Need','Transformer Variants','Retrieval-Augmented Generation','Vector Embeddings','Prompt Engineering Patterns','Fine-tuning vs RAG','Tokenization Quirks','Evaluation of LLMs','Agents and Tool Use','Context Window Limits']],
 ['Climate & Satellites', 'Satellite sensors give frequent, global measurements; the work is turning raw bands into reliable emission and risk estimates.', ['Satellite Imagery Basics','Carbon Accounting','Sentinel-2 Bands','Climate Risk Models','Remote Sensing with CNNs','Methane Detection','Deforestation Monitoring','Insurance & Climate','Geospatial Data Formats','Emissions Trading']],
 ['Game Theory', 'Strategic agents choose actions anticipating each other; mechanism design flips the problem and builds rules that induce good behaviour.', ['Nash Equilibrium','Mechanism Design','Auction Theory',"Prisoner's Dilemma Variants",'Repeated Games','Signaling Games','Evolutionary Game Theory','Principal-Agent Problem','Coordination Games','Cooperative Games']],
];
const KW = ['reinforcement reward policy agent learning decision', 'decision incentive bias behavioral choice economics', 'product growth metrics feedback experiment', 'language model retrieval embeddings transformer', 'climate satellite emissions carbon imagery', 'strategy decision equilibrium incentive game'].map(s => s.split(' '));
let seed = 7; const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;

export const clusters: C[] = DATA.map((d, i) => ({ id: 'c' + i, label: d[0], node_count: d[2].length }));
export const nodes: N[] = DATA.flatMap((d, ci) => d[2].map((t, j) => ({
  id: `n${ci}_${j}`, title: t, source: ['notion', 'markdown', 'notion', 'github'][(ci + j) % 4], cluster_id: 'c' + ci, rank: 0,
  created_at: new Date(Date.UTC(2025, 3, 1) + (ci * 45 + rnd() * 240) * 864e5).toISOString(),
})));
const id = (t: string) => nodes.find(n => n.title === t)!.id;
export const edges: E[] = [];
for (let ci = 0; ci < 6; ci++) for (let j = 0; j < 10; j++) {
  edges.push({ source: `n${ci}_${j}`, target: `n${ci}_${(j + 1) % 10}`, type: 'RELATED_TO', similarity: +(0.84 + rnd() * 0.1).toFixed(2) });
  if (rnd() < 0.55) edges.push({ source: `n${ci}_${j}`, target: `n${ci}_${(j + 2 + Math.floor(rnd() * 5)) % 10}`, type: 'RELATED_TO', similarity: +(0.82 + rnd() * 0.08).toFixed(2) });
}
const X: [string, string, number][] = [['Reward Shaping Pitfalls', 'Incentive Design', 0.87], ['Mechanism Design', 'Incentive Design', 0.89], ['Feedback Loops in Products', 'Exploration vs Exploitation', 0.84], ['Vector Embeddings', 'Remote Sensing with CNNs', 0.83], ['RLHF Overview', 'Fine-tuning vs RAG', 0.85], ['Growth Loops', 'Multi-Armed Bandits', 0.83], ['Principal-Agent Problem', 'Incentive Design', 0.86], ['Satellite Imagery Basics', 'Climate Risk Models', 0.9]];
X.forEach(([a, b, s]) => edges.push({ source: id(a), target: id(b), type: 'RELATED_TO', similarity: s }));
edges.push({ source: id('Nash Equilibrium'), target: id('Prospect Theory'), type: 'CONTRADICTS', similarity: 0.8, explanation: 'Nash assumes fully rational payoff maximisers; prospect theory documents systematic deviations from that.' });
edges.push({ source: id('North Star Metrics'), target: id('Reward Shaping Pitfalls'), type: 'CONTRADICTS', similarity: 0.78, explanation: 'Optimising one headline metric invites the same reward hacking described in the RL notes.' });
const deg = new Map<string, number>(); edges.forEach(e => { deg.set(e.source, (deg.get(e.source) || 0) + 1); deg.set(e.target, (deg.get(e.target) || 0) + 1); });
const mx = Math.max(...deg.values()); nodes.forEach(n => (n.rank = +((deg.get(n.id) || 0) / mx).toFixed(2)));

const blurb = (cid: string | null) => DATA[+(cid || 'c0').slice(1)][1];
export const note = (nid: string): Note => {
  const n = nodes.find(x => x.id === nid)!, t = (id: string) => nodes.find(y => y.id === id)!.title;
  // demo only: pretend a few graph edges are explicit [[wikilinks]]
  const out = edges.filter(e => e.type === 'RELATED_TO' && e.source === nid).slice(0, 2).map(e => ({ target: t(e.target), note_id: e.target }));
  const back = edges.filter(e => e.type === 'RELATED_TO' && e.target === nid).slice(0, 3).map(e => ({ id: e.source, title: t(e.source) }));
  return { id: n.id, title: n.title, content_text: `${n.title}. ${blurb(n.cluster_id)}`, links: out, backlinks: back };
};
export function search(q: string): Hit[] {
  const t = q.toLowerCase().match(/[a-z]{4,}/g) || [], per = new Map<string, number>();
  return nodes.map(n => {
    const ci = +n.cluster_id!.slice(1), ti = n.title.toLowerCase();
    const s = Math.min(0.93, 0.5 + KW[ci].filter(k => t.some(w => k.startsWith(w.slice(0, 5)))).length * 0.1 + t.filter(w => ti.includes(w)).length * 0.2 + ((n.id.length * 7 + n.title.length) % 10) * 0.004);
    return { note_id: n.id, title: n.title, source: n.source, similarity: +s.toFixed(2), snippet: blurb(n.cluster_id).slice(0, 110) + '…' };
  }).filter(h => h.similarity > 0.58).sort((a, b) => b.similarity - a.similarity)
    .filter(h => { const c = nodes.find(n => n.id === h.note_id)!.cluster_id!; per.set(c, (per.get(c) || 0) + 1); return per.get(c)! <= 3; }).slice(0, 8);
}

export function chat(q: string): import('./types').ChatResp {
  const hits = search(q).slice(0, 6), seen = new Set<string>(), parts: string[] = [], citations: any[] = [];
  hits.forEach((h, i) => { citations.push({ n: i + 1, note_id: h.note_id, title: h.title, similarity: h.similarity }); });
  for (const [i, h] of hits.entries()) { const c = nodes.find(n => n.id === h.note_id)!.cluster_id!; if (seen.has(c) || seen.size >= 3) continue; seen.add(c); const idx = hits.filter(x => nodes.find(n => n.id === x.note_id)!.cluster_id === c).map(x => `[${hits.indexOf(x) + 1}]`).join(''); parts.push(`${DATA[+c.slice(1)][1]} ${idx}`); }
  const answer = `${parts.join('\n\n')}\n\nThe thread connecting them is incentive design: your notes treat rewards as something you shape, then discover agents (and people) optimise the metric, not the intent. Note the tension between “North Star Metrics” and “Reward Shaping Pitfalls” in your graph.`;
  return { answer, citations, related_concepts: [{ note_id: id('Principal-Agent Problem'), title: 'Principal-Agent Problem' }, { note_id: id('Growth Loops'), title: 'Growth Loops' }] };
}
export const ideas = [
  { title: 'Incentive-aware reward tuning', pitch: 'Use mechanism-design results to audit RL reward functions before training, flagging where an agent can game the metric. Ship it as a linter for RLHF pipelines.', combines: ['Reinforcement Learning', 'Behavioral Economics', 'Game Theory'] },
  { title: 'Satellite retrieval copilot', pitch: 'A RAG assistant over satellite archives that answers climate-risk questions with cited tiles, and learns from analyst feedback loops.', combines: ['Transformers & LLMs', 'Climate & Satellites', 'Product Management'] },
  { title: 'Growth loops as bandits', pitch: 'Treat every onboarding step as an arm in a contextual bandit, with loss-averse framing as a tunable feature. Replace A/B calendars with continuous allocation.', combines: ['Product Management', 'Reinforcement Learning', 'Behavioral Economics'] },
];
export const gaps = [
  { topic: 'Information Retrieval fundamentals', why: 'You have embeddings and RAG notes but nothing on ranking, BM25 or evaluation metrics like nDCG.', related_to: 'Transformers & LLMs' },
  { topic: 'Causal Inference', why: 'A/B testing pitfalls are covered, but not the causal framework that explains them.', related_to: 'Product Management' },
  { topic: 'Linear Algebra for Embeddings', why: 'Vector similarity is used everywhere in your notes without the underlying geometry.', related_to: 'Transformers & LLMs' },
  { topic: 'Multi-Agent RL', why: 'Game theory and RL are both well covered, but the bridge between them is missing.', related_to: 'Game Theory' },
];
export const concepts = [{ name: 'Incentive Systems', notes: 14, clusters: 4 }, { name: 'Feedback Loops', notes: 11, clusters: 3 }, { name: 'Reward Signals', notes: 9, clusters: 3 }, { name: 'Exploration vs Exploitation', notes: 7, clusters: 3 }, { name: 'Equilibrium', notes: 6, clusters: 2 }, { name: 'Embeddings', notes: 5, clusters: 2 }];

export const settings = { embedding_version: 'openai:text-embedding-3-large:3072', sync_interval_hours: 6, graph_threshold: 0.82, llm_enabled: true, role: 'owner', workspace_id: 'w2', user_id: 'u1', mfa_enabled: false, recovery_codes_left: 0, notes: { total: 60, indexed: 60, outdated: 0 } };
export const sources = [{ id: 's1', type: 'notion', status: 'idle', last_sync_at: '2026-11-14T08:12:00Z', last_error: null }, { id: 's2', type: 'github', status: 'idle', last_sync_at: '2026-11-14T08:12:40Z', last_error: null }, { id: 's3', type: 'github', status: 'error', last_sync_at: '2026-11-13T20:00:00Z', last_error: 'Cannot access that repository (check the name and token)' }];

export const audit = [{ ts: '2026-11-14T09:41:00Z', action: 'POST /api/assistant/chat', resource: null, status: 201 }, { ts: '2026-11-14T09:40:12Z', action: 'GET /api/notes/:id', resource: 'be9e84c8', status: 200 }, { ts: '2026-11-14T09:39:50Z', action: 'POST /api/search/hybrid', resource: null, status: 201 }, { ts: '2026-11-14T09:12:03Z', action: 'POST /api/sources/:id/sync', resource: 's2', status: 201 }, { ts: '2026-11-14T08:55:31Z', action: 'POST /api/notes/upload', resource: null, status: 201 }];

export const workspaces = [{ id: 'w1', name: 'My Observatory', role: 'owner', current: false, members: 1 }, { id: 'w2', name: 'Research Team', role: 'owner', current: true, members: 3 }, { id: 'w3', name: 'Reading Group', role: 'viewer', current: false, members: 7 }];
export const members = { role: 'owner', members: [{ user_id: 'u1', email: 'you@example.com', role: 'owner' }, { user_id: 'u2', email: 'maria@lab.org', role: 'editor' }, { user_id: 'u3', email: 'jon@lab.org', role: 'viewer' }], invites: [{ email: 'new.student@lab.org', role: 'viewer' }] };
export const topics = [
  { id: 'c0', label: 'Reinforcement Learning', size: 10, recent_count: 7, recent_share: 0.7, emerging: true, keywords: [['reward', 1], ['policy', 0.86], ['agent', 0.74], ['exploration', 0.55], ['value', 0.41]] },
  { id: 'c1', label: 'Behavioral Economics', size: 10, recent_count: 1, recent_share: 0.1, emerging: false, keywords: [['aversion', 1], ['framing', 0.8], ['choices', 0.72], ['defaults', 0.6], ['payoffs', 0.45]] },
  { id: 'c2', label: 'Product Management', size: 10, recent_count: 2, recent_share: 0.2, emerging: false, keywords: [['metric', 1], ['feedback', 0.83], ['funnel', 0.62], ['cohorts', 0.5], ['pricing', 0.4]] },
  { id: 'c3', label: 'Transformers & LLMs', size: 10, recent_count: 4, recent_share: 0.4, emerging: false, keywords: [['retrieval', 1], ['embeddings', 0.9], ['context', 0.7], ['tokenization', 0.5], ['prompt', 0.44]] },
  { id: 'c4', label: 'Climate & Satellites', size: 10, recent_count: 1, recent_share: 0.1, emerging: false, keywords: [['satellite', 1], ['emissions', 0.8], ['imagery', 0.7], ['methane', 0.5], ['carbon', 0.46]] },
].map(t => ({ ...t, keywords: (t.keywords as [string, number][]).map(([term, score]) => ({ term, score })) }));
