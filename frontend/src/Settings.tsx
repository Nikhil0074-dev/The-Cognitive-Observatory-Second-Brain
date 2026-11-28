import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { api } from './api';
import type { Audit, Members, Settings as S, Source } from './types';

export default function Settings({ onClose, onChanged, notice }: { onClose: () => void; onChanged: () => void; notice?: string }) {
  const [s, setS] = useState<S | null>(null), [src, setSrc] = useState<Source[]>([]), [repo, setRepo] = useState(''), [tok, setTok] = useState(''), [notion, setNotion] = useState(''), [msg, setMsg] = useState(notice || ''), [zid, setZid] = useState(''), [zkey, setZkey] = useState(''), [busy, setBusy] = useState(''), [log, setLog] = useState<Audit[]>([]), [pw, setPw] = useState(''), [confirm, setConfirm] = useState(false), [mfa, setMfa] = useState<{ secret: string; qr: string } | null>(null), [mfaCode, setMfaCode] = useState(''), [mfaPw, setMfaPw] = useState(''), [codes, setCodes] = useState<string[] | null>(null), [members, setMembers] = useState<Members | null>(null), [newWs, setNewWs] = useState(''), [invEmail, setInvEmail] = useState(''), [invRole, setInvRole] = useState('viewer');
  const load = async () => { const [a, b, c] = await Promise.all([api.settings(), api.sources(), api.audit()]); setS(a); setSrc(b); setLog(c); setMembers(await api.members(a.workspace_id).catch(() => null)); };
  useEffect(() => { load().catch(() => setMsg('Could not load settings.')); }, []);
  const run = async (key: string, fn: () => Promise<any>, ok: (r: any) => string) => { setBusy(key); setMsg(''); try { setMsg(ok(await fn())); await load(); onChanged(); } catch (e: any) { setMsg(String(e.message).replace(/[{}"]|statusCode|message|error/g, ' ').trim().slice(0, 140) || 'Something went wrong.'); } setBusy(''); };
  const ago = (t: string | null) => (t ? new Date(t).toLocaleString() : 'never');
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => { const prev = document.activeElement as HTMLElement | null; panel.current?.focus(); const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', esc); return () => { window.removeEventListener('keydown', esc); prev?.focus?.(); }; }, []); // Esc closes; focus moves in and returns
  const canEdit = s?.role === 'owner' || s?.role === 'editor', isOwner = s?.role === 'owner', wsId = s?.workspace_id || '';
  return (
    <div className="modal" onClick={onClose}><div className="panel" ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Settings" onClick={e => e.stopPropagation()}>
      <div className="row"><span className="eyebrow" style={{ margin: 0 }}>SETTINGS</span><button onClick={onClose}>Close</button></div>
      {s && (<>
        <div className="eyebrow">EMBEDDINGS</div>
        <div className="kv"><span>Model</span><span className="mono">{s.embedding_version}</span></div>
        <div className="kv"><span>Indexed</span><span className="mono">{s.notes.indexed} / {s.notes.total}</span></div>
        <div className="kv"><span>Out of date</span><span className={'mono ' + (s.notes.outdated ? 'plasma' : '')}>{s.notes.outdated}</span></div>
        <div className="kv"><span>Auto-sync every</span><span className="mono">{s.sync_interval_hours >= 1 ? s.sync_interval_hours + ' h' : Math.round(s.sync_interval_hours * 60) + ' min'}</span></div>
        <div className="kv"><span>Edge threshold</span><span className="mono">{s.graph_threshold}</span></div>
        <div className="kv"><span>AI features</span><span className={s.llm_enabled ? 'lime' : 'muted'}>{s.llm_enabled ? 'enabled' : 'add ANTHROPIC_API_KEY'}</span></div>
        {canEdit && <button disabled={busy === 'ri'} onClick={() => run('ri', api.reindex, r => `Queued ${r.queued} notes for re-embedding.`)}>{s.notes.outdated ? `Re-index ${s.notes.outdated} outdated notes` : 'Re-index unfinished notes'}</button>}
      </>)}
      <div className="eyebrow">TEAM · {(s?.role || '').toUpperCase()}</div>
      {s && !canEdit && <p className="meta">View-only access: you can search and ask questions here, but not change content.</p>}
      {members?.members.map(m => (<div key={m.user_id} className="kv"><span>{m.email}{m.user_id === s?.user_id ? ' (you)' : ''}</span><span className="row" style={{ gap: 6 }}>
        {isOwner && m.role !== 'owner' ? <select aria-label={`Role for ${m.email}`} value={m.role} onChange={e => run('r' + m.user_id, () => api.setMemberRole(wsId, m.user_id, e.target.value), () => 'Role updated.')}><option value="editor">editor</option><option value="viewer">viewer</option></select> : <span className="mono">{m.role}</span>}
        {isOwner && m.role !== 'owner' && <><button className="mini" onClick={() => run('o' + m.user_id, () => api.transfer(wsId, m.user_id), () => 'Ownership transferred.')}>make owner</button><button className="mini danger" onClick={() => run('x' + m.user_id, () => api.removeMember(wsId, m.user_id), () => 'Member removed.')}>remove</button></>}</span></div>))}
      {members?.invites.map(i => (<div key={i.email} className="kv"><span className="muted">{i.email} (invited)</span><span className="row" style={{ gap: 6 }}><span className="mono">{i.role}</span>{isOwner && <button className="mini" onClick={() => run('c' + i.email, () => api.cancelInvite(wsId, i.email), () => 'Invite cancelled.')}>cancel</button>}</span></div>))}
      {isOwner && (<div className="row" style={{ gap: 6 }}><input aria-label="Invite by email" placeholder="invite by email" value={invEmail} onChange={e => setInvEmail(e.target.value)} /><select aria-label="Role for the invitee" value={invRole} onChange={e => setInvRole(e.target.value)}><option value="viewer">viewer</option><option value="editor">editor</option></select>
        <button disabled={!invEmail} onClick={() => run('inv', () => api.addMember(wsId, invEmail, invRole), (r: any) => { setInvEmail(''); return r.added ? 'Added to the workspace.' : 'Invite saved: it applies when they register.'; })}>Invite</button></div>)}
      {s && !isOwner && <button className="danger" onClick={() => run('leave', () => api.removeMember(wsId, s.user_id), () => 'You left the workspace.')}>Leave this workspace</button>}
      <div className="row" style={{ gap: 6 }}><input placeholder="new workspace name" value={newWs} onChange={e => setNewWs(e.target.value)} /><button disabled={!newWs} onClick={() => run('nw', () => api.createWorkspace(newWs), () => { setNewWs(''); return 'Workspace created. Switch to it from the top bar.'; })}>Create</button></div>
      {isOwner && <button className="danger" onClick={() => window.confirm('Delete this workspace and ALL of its notes for every member? This cannot be undone.') && run('dw', () => api.deleteWorkspace(wsId), () => 'Workspace deleted.')}>Delete this workspace…</button>}
      {canEdit && (<>
      <div className="eyebrow">CLUSTERING</div>
      <div className="row"><button disabled={busy === 'km'} onClick={() => run('km', () => api.rebuild('kmeans'), () => 'Clusters rebuilt with k-means.')}>Rebuild · k-means</button><button disabled={busy === 'lv'} onClick={() => run('lv', () => api.rebuild('louvain'), () => 'Clusters rebuilt with Louvain.')}>Rebuild · Louvain</button></div>
      <p className="meta">k-means picks about √(n/2) groups; Louvain finds communities in the similarity graph and chooses the count itself.</p>
      </>)}
      <div className="eyebrow">SOURCES</div>
      {src.length === 0 && <p className="muted serif">Nothing connected yet.</p>}
      {src.map(x => (<div key={x.id} className="src"><div className="row"><span className="title">{x.type}</span><span className={'mono ' + (x.status === 'error' ? 'plasma' : 'lime')}>{x.status}</span></div>
        <div className="meta">last sync {ago(x.last_sync_at)}</div>{x.last_error && <div className="meta plasma">{x.last_error}</div>}
        <button disabled={busy === x.id || !canEdit} onClick={() => run(x.id, () => api.syncSource(x.id), r => `Synced ${r.pages} pages, ${r.changed} changed.`)}>{busy === x.id ? 'Syncing…' : 'Sync now'}</button></div>))}
      {canEdit && (<>
      <div className="eyebrow">CONNECT GITHUB</div>
      <input placeholder="owner/repo" value={repo} onChange={e => setRepo(e.target.value)} />
      <input placeholder="token (optional, for private repos)" type="password" value={tok} onChange={e => setTok(e.target.value)} />
      <button disabled={!repo} onClick={() => run('gh', () => api.connectGithub(repo, tok), () => { setRepo(''); setTok(''); return 'Repository connected. Press Sync now.'; })}>Connect</button>
      <div className="eyebrow">CONNECT GOOGLE DRIVE</div>
      <button onClick={() => run('gd', async () => { window.location.href = await api.driveAuthUrl(); return {}; }, () => 'Redirecting to Google…')}>Connect Google Drive (read-only)</button>
      <div className="eyebrow">CONNECT ZOTERO</div>
      <input placeholder="numeric user ID" value={zid} onChange={e => setZid(e.target.value)} />
      <input placeholder="API key" type="password" value={zkey} onChange={e => setZkey(e.target.value)} />
      <button disabled={!zid || !zkey} onClick={() => run('zt', () => api.connectZotero(zid, zkey), () => { setZid(''); setZkey(''); return 'Zotero connected. Press Sync now.'; })}>Connect</button>
      <div className="eyebrow">CONNECT ONENOTE</div>
      <button onClick={() => run('on', async () => { window.location.href = await api.onenoteAuthUrl(); return {}; }, () => 'Redirecting to Microsoft…')}>Connect OneNote (read-only)</button>
      <div className="eyebrow">CONNECT NOTION</div>
      <input placeholder="integration token" type="password" value={notion} onChange={e => setNotion(e.target.value)} />
      <button disabled={!notion} onClick={() => run('nt', () => api.connectNotion(notion), () => { setNotion(''); return 'Notion connected. Press Sync now.'; })}>Connect</button>
      </>)}
      <div className="eyebrow">SECURITY</div>
      {s && !s.mfa_enabled && !mfa && <button onClick={() => run('ms', async () => { const r = await api.mfaSetup(); setMfa({ secret: r.secret, qr: await QRCode.toDataURL(r.otpauth, { margin: 1, width: 168, color: { dark: '#0A0E12', light: '#E8E2D5' } }) }); return {}; }, () => 'Scan the code with your authenticator app, then enter a code.')}>Enable two-factor authentication</button>}
      {mfa && (<div className="mfa"><img src={mfa.qr} alt="Authenticator QR code" width={168} height={168} /><div><div className="meta">Or enter this key manually</div><div className="mono key">{mfa.secret.match(/.{1,4}/g)!.join(' ')}</div>
        <input className="mono" inputMode="numeric" maxLength={6} placeholder="6-digit code" value={mfaCode} onChange={e => setMfaCode(e.target.value.replace(/\D/g, ''))} />
        <button className="primary" disabled={mfaCode.length !== 6} onClick={() => run('me', () => api.mfaEnable(mfaCode), r => { setMfa(null); setMfaCode(''); setCodes(r.recovery_codes); return 'Two-factor authentication is on. Save your recovery codes now.'; })}>Confirm and enable</button></div></div>)}
      {codes && (<div className="codes"><div className="meta plasma">Recovery codes: shown once. Each works one time if you lose your authenticator.</div>
        <div className="grid">{codes.map(c => <span key={c} className="mono">{c}</span>)}</div>
        <div className="row"><button onClick={() => navigator.clipboard?.writeText(codes.join('\n'))}>Copy all</button><button className="primary" onClick={() => setCodes(null)}>I've saved them</button></div></div>)}
      {s?.mfa_enabled && (<><p className="meta"><span className="lime">Two-factor authentication is on.</span> Login needs a 6-digit code; each code works once. <span className={s.recovery_codes_left <= 2 ? 'plasma' : ''}>{s.recovery_codes_left} recovery codes left.</span></p>
        <input type="password" placeholder="password" value={mfaPw} onChange={e => setMfaPw(e.target.value)} />
        <input className="mono" maxLength={11} placeholder="authenticator or recovery code" value={mfaCode} onChange={e => setMfaCode(e.target.value.replace(/[^0-9A-Za-z-]/g, ''))} />
        <div className="row"><button disabled={!mfaPw || mfaCode.length < 6} onClick={() => run('mr', () => api.mfaRecovery(mfaPw, mfaCode), r => { setMfaPw(''); setMfaCode(''); setCodes(r.recovery_codes); return 'New recovery codes generated. The old ones no longer work.'; })}>New recovery codes</button><button className="danger" disabled={!mfaPw || mfaCode.length < 6} onClick={() => run('md', () => api.mfaDisable(mfaPw, mfaCode), () => { setMfaPw(''); setMfaCode(''); return 'Two-factor authentication is off.'; })}>Disable two-factor</button></div></>)}
      <div className="row"><button onClick={() => api.logout()}>Sign out</button><button onClick={() => api.logoutAll()}>Sign out everywhere</button></div>
      <div className="eyebrow">RECENT ACTIVITY</div>
      {log.map((l, i) => <div key={i} className="kv"><span className="mono" style={{ fontSize: 11 }}>{new Date(l.ts).toLocaleTimeString()} {l.action.replace('/api', '')}</span><span className={'mono ' + (l.status >= 400 ? 'plasma' : '')}>{l.status}</span></div>)}
      <p className="meta">Only the route, note id and status are recorded, never your queries or note text.</p>
      <div className="eyebrow plasma">DELETE ACCOUNT</div>
      {!confirm ? <button className="danger" onClick={() => setConfirm(true)}>Delete my account and all data…</button> : (<>
        <p className="meta">This permanently removes every note, embedding, graph node and source. It cannot be undone.</p>
        <input type="password" placeholder="confirm with your password" value={pw} onChange={e => setPw(e.target.value)} />
        <div className="row"><button className="danger" disabled={!pw} onClick={() => run('del', () => api.deleteAccount(pw), () => '')}>Delete everything</button><button onClick={() => { setConfirm(false); setPw(''); }}>Cancel</button></div></>)}
      {msg && <p className="serif msg">{msg}</p>}
    </div></div>
  );
}
