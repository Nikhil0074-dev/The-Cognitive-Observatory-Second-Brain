import type { Members, Topic, Workspace, Audit, Settings, Source, C, ChatResp, Concept, E, Gap, Hit, Idea, N, Note } from './types';
import * as demo from './demo';
export const DEMO = import.meta.env.VITE_DEMO === 'true';
const BASE = import.meta.env.VITE_API_URL || '/api';
let token = sessionStorage.getItem('sb_token') || '', refresh = sessionStorage.getItem('sb_refresh') || '';
const store = (r: { token: string; refresh_token?: string }) => { token = r.token; sessionStorage.setItem('sb_token', token); if (r.refresh_token) { refresh = r.refresh_token; sessionStorage.setItem('sb_refresh', refresh); } };
const clear = () => { token = refresh = ''; sessionStorage.removeItem('sb_token'); sessionStorage.removeItem('sb_refresh'); };
let pending: Promise<boolean> | null = null; // single-flight: parallel 401s share one refresh
const tryRefresh = () => (pending ??= (async () => {
  try {
    if (!refresh) return false;
    const r = await fetch(`${BASE}/auth/refresh`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refresh_token: refresh }) });
    if (!r.ok) return false; store(await r.json()); return true;
  } catch { return false; } finally { pending = null; }
})());
const call = async (path: string, init: RequestInit = {}, retry = true): Promise<any> => {
  const r = await fetch(BASE + path, { ...init, headers: { ...(init.body instanceof FormData ? {} : { 'content-type': 'application/json' }), Authorization: `Bearer ${token}`, ...init.headers } });
  if (r.status === 401 && retry && (await tryRefresh())) return call(path, init, false); // expired access token: refresh silently and retry once
  if (r.status === 401) { clear(); location.reload(); }
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};
export const api = {
  hasToken: () => !!token || !!refresh,
  logout: async () => { try { await fetch(`${BASE}/auth/logout`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refresh_token: refresh }) }); } catch { /* offline: still clear locally */ } clear(); location.reload(); },
  logoutAll: async () => { await call('/auth/logout-all', { method: 'POST', body: '{}' }, false).catch(() => null); clear(); location.reload(); },
  async auth(mode: 'login' | 'register', email: string, password: string, code?: string) {
    const r = await fetch(`${BASE}/auth/${mode}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, code: code || undefined }) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); const e: any = new Error(r.status === 429 ? 'Too many attempts. Try again in a few minutes.' : j.message === 'MFA code required' ? '' : j.message || 'Authentication failed'); e.mfa = !!j.mfa_required; throw e; }
    store(await r.json());
  },
  mfaSetup: async (): Promise<{ secret: string; otpauth: string }> => DEMO ? { secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', otpauth: 'otpauth://totp/Observatory:demo?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Observatory' } : call('/auth/mfa/setup', { method: 'POST', body: '{}' }),
  mfaEnable: (code: string): Promise<{ recovery_codes: string[] }> => (DEMO ? Promise.resolve({ recovery_codes: ['K7QPD-4WXMA', 'R2TNB-HE5YC', 'ZJ6LF-3VQ7S', 'M4DGU-P2XNE', 'W5HCA-7BKRT', 'Y3SFQ-N6EJD', 'B2XVL-9TPMH', 'G7ARC-5DQWZ'] }) : call('/auth/mfa/enable', { method: 'POST', body: JSON.stringify({ code }) })),
  mfaRecovery: (password: string, code: string): Promise<{ recovery_codes: string[] }> => (DEMO ? api.mfaEnable('') : call('/auth/mfa/recovery', { method: 'POST', body: JSON.stringify({ password, code }) })),
  mfaDisable: (password: string, code: string) => (DEMO ? Promise.resolve({}) : call('/auth/mfa/disable', { method: 'POST', body: JSON.stringify({ password, code }) })),
  network: async (): Promise<{ nodes: N[]; edges: E[] }> => DEMO ? { nodes: demo.nodes, edges: demo.edges } : call('/graph/network?limit=800'),
  clusters: async (): Promise<C[]> => DEMO ? demo.clusters : call('/graph/clusters'),
  search: async (query: string): Promise<Hit[]> => DEMO ? demo.search(query) : (await call('/search/hybrid', { method: 'POST', body: JSON.stringify({ query }) })).results.map((h: any) => ({ ...h, similarity: h.similarity ?? h.rrf })),
  note: async (id: string): Promise<Note> => DEMO ? demo.note(id) : call('/notes/' + id),
  async upload(files: FileList) { const f = new FormData(); Array.from(files).forEach(x => f.append('files', x)); await call('/notes/upload', { method: 'POST', body: f }); },
  chat: async (query: string, history: { role: string; content: string }[]): Promise<ChatResp> => DEMO ? (await new Promise(r => setTimeout(r, 700)), demo.chat(query)) : call('/assistant/chat', { method: 'POST', body: JSON.stringify({ query, history }) }),
  ideas: async (): Promise<Idea[]> => DEMO ? demo.ideas : (await call('/insights/ideas', { method: 'POST', body: '{}' })).ideas,
  gaps: async (): Promise<Gap[]> => DEMO ? demo.gaps : (await call('/insights/gaps', { method: 'POST', body: '{}' })).gaps,
  concepts: async (): Promise<Concept[]> => DEMO ? demo.concepts : call('/insights/concepts'),
  accept: (a: string, b: string, type: string) => (DEMO ? Promise.resolve() : call('/graph/edges', { method: 'POST', body: JSON.stringify({ a, b, type }) })),
  settings: async (): Promise<Settings> => DEMO ? demo.settings : call('/settings'),
  sources: async (): Promise<Source[]> => DEMO ? demo.sources : call('/sources'),
  syncSource: (id: string) => (DEMO ? Promise.resolve({ pages: 0, changed: 0 }) : call(`/sources/${id}/sync`, { method: 'POST', body: '{}' })),
  connectGithub: (repo: string, token: string) => (DEMO ? Promise.resolve({}) : call('/sources/github', { method: 'POST', body: JSON.stringify({ repo, token: token || undefined }) })),
  connectNotion: (token: string) => (DEMO ? Promise.resolve({}) : call('/sources/notion', { method: 'POST', body: JSON.stringify({ token }) })),
  reindex: (): Promise<{ queued: number }> => (DEMO ? Promise.resolve({ queued: 0 }) : call('/notes/reindex', { method: 'POST', body: '{}' })),
  audit: async (): Promise<Audit[]> => DEMO ? demo.audit : call('/audit?limit=8').catch(() => []), // owner-only: empty for other roles
  async deleteAccount(password: string) { if (DEMO) throw new Error('Disabled in demo mode'); await call('/account', { method: 'DELETE', body: JSON.stringify({ password }) }); clear(); location.reload(); },
  connectZotero: (user_id: string, api_key: string) => (DEMO ? Promise.resolve({}) : call('/sources/zotero', { method: 'POST', body: JSON.stringify({ user_id, api_key }) })),
  driveAuthUrl: async (): Promise<string> => { if (DEMO) throw new Error('Disabled in demo mode'); return (await call('/sources/drive/auth-url')).url; },
  workspaces: async (): Promise<Workspace[]> => DEMO ? (demo.workspaces as Workspace[]) : call('/workspaces'),
  switchWorkspace: async (id: string) => { if (DEMO) return; store(await call(`/workspaces/${id}/switch`, { method: 'POST', body: '{}' })); },
  createWorkspace: (name: string) => (DEMO ? Promise.resolve({}) : call('/workspaces', { method: 'POST', body: JSON.stringify({ name }) })),
  deleteWorkspace: (id: string) => (DEMO ? Promise.resolve({}) : call(`/workspaces/${id}`, { method: 'DELETE' })),
  members: async (id: string): Promise<Members> => DEMO ? demo.members : call(`/workspaces/${id}/members`),
  addMember: (id: string, email: string, role: string) => (DEMO ? Promise.resolve({}) : call(`/workspaces/${id}/members`, { method: 'POST', body: JSON.stringify({ email, role }) })),
  setMemberRole: (id: string, uid: string, role: string) => (DEMO ? Promise.resolve({}) : call(`/workspaces/${id}/members/${uid}`, { method: 'PATCH', body: JSON.stringify({ role }) })),
  removeMember: (id: string, uid: string) => (DEMO ? Promise.resolve({}) : call(`/workspaces/${id}/members/${uid}`, { method: 'DELETE' })),
  cancelInvite: (id: string, email: string) => (DEMO ? Promise.resolve({}) : call(`/workspaces/${id}/invites/${encodeURIComponent(email)}`, { method: 'DELETE' })),
  transfer: (id: string, user_id: string) => (DEMO ? Promise.resolve({}) : call(`/workspaces/${id}/transfer`, { method: 'POST', body: JSON.stringify({ user_id }) })),
  onenoteAuthUrl: async (): Promise<string> => { if (DEMO) throw new Error('Disabled in demo mode'); return (await call('/sources/onenote/auth-url')).url; },
  topics: async (): Promise<Topic[]> => DEMO ? demo.topics : call('/graph/topics'),
  rebuild: (method: 'kmeans' | 'louvain' = 'louvain') => (DEMO ? Promise.resolve() : call('/graph/clusters/rebuild', { method: 'POST', body: JSON.stringify({ method }) })),
};
