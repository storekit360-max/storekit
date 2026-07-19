import React, { useCallback, useEffect, useMemo, useState } from 'react';
import API from '../../utils/api';
import { useSearchParams } from 'react-router-dom';

const messageOf = error => error.response?.data?.message || error.message || 'Request failed';

export default function SuperAdminAccessControl({ notify }) {
  const [searchParams] = useSearchParams();
  const [permissions, setPermissions] = useState([]);
  const [roles, setRoles] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedRole, setSelectedRole] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [invite, setInvite] = useState({ email: '', roleIds: [] });
  const [details, setDetails] = useState(null);

  const openUser = useCallback(async user => { try { const { data } = await API.get(`/superadmin/access/users/${user._id}`, { skipCache: true }); setDetails(data); } catch (error) { notify('error', messageOf(error)); } }, [notify]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [permissionResult, roleResult, userResult] = await Promise.all([
        API.get('/superadmin/permissions'), API.get('/superadmin/roles'), API.get('/superadmin/access/users'),
      ]);
      setPermissions(permissionResult.data.permissions || []);
      setRoles(roleResult.data || []);
      setUsers(userResult.data.users || []);
    } catch (error) { notify('error', messageOf(error)); }
    finally { setLoading(false); }
  }, [notify]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const requested=searchParams.get('user'); const match=requested&&users.find(item=>item._id===requested); if(match)openUser(match); }, [openUser, searchParams, users]);

  const grouped = useMemo(() => permissions.reduce((result, permission) => {
    (result[permission.group] ||= []).push(permission);
    return result;
  }, {}), [permissions]);
  const visibleUsers = users.filter(user => `${user.firstName} ${user.lastName} ${user.email}`.toLowerCase().includes(search.toLowerCase()));

  function newRole() { setSelectedRole({ name: '', description: '', permissions: [], active: true }); }
  function togglePermission(key) {
    setSelectedRole(role => ({ ...role, permissions: role.permissions.includes(key) ? role.permissions.filter(item => item !== key) : [...role.permissions, key] }));
  }
  async function saveRole(event) {
    event.preventDefault(); setSaving(true);
    try {
      if (selectedRole._id) await API.put(`/superadmin/roles/${selectedRole._id}`, selectedRole);
      else await API.post('/superadmin/roles', selectedRole);
      notify('success', 'Role saved'); setSelectedRole(null); await load();
    } catch (error) { notify('error', messageOf(error)); }
    finally { setSaving(false); }
  }
  async function updateUserRoles(user, roleIds) {
    try {
      await API.put(`/superadmin/access/users/${user._id}/roles`, { roleIds });
      notify('success', `Updated access for ${user.email}`); await load();
    } catch (error) { notify('error', messageOf(error)); }
  }
  async function inviteUser(event) { event.preventDefault(); try { await API.post('/superadmin/access/users/invite', invite); notify('success', 'Platform invitation sent'); setInvite({ email: '', roleIds: [] }); } catch (error) { notify('error', messageOf(error)); } }
  async function userAction(user, action, method = 'post') { try { if (action === 'delete' && !window.confirm(`Permanently delete ${user.email}? Audit history remains.`)) return; if (action === 'suspend' && !window.confirm(`Suspend ${user.email} and revoke all sessions?`)) return; await API[method](`/superadmin/access/users/${user._id}/${action === 'delete' ? '' : action}`.replace(/\/$/, ''), action === 'suspend' ? { reason: 'Suspended from Access Control' } : undefined); notify('success', `Platform user ${action.replace('-', ' ')} completed`); setDetails(null); await load(); } catch (error) { notify('error', messageOf(error)); } }
  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">Loading access controls…</div>;
  return <div className="space-y-6">
    <section className="rounded-2xl bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 p-6 text-white">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-300">Least privilege</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-2xl font-extrabold">Platform access control</h2><p className="mt-2 text-sm text-slate-300">Assign database-backed roles and granular permissions to platform operators.</p></div><button onClick={newRole} className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-bold hover:bg-indigo-400">Create role</button></div>
    </section>

    <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="font-bold text-slate-900">Roles</h3><div className="mt-4 space-y-2">{roles.map(role => <button key={role._id} onClick={() => setSelectedRole({ ...role, permissions: role.permissions || [] })} className="flex w-full items-center justify-between rounded-xl border border-slate-200 p-3 text-left hover:border-indigo-300"><span><strong className="block text-sm text-slate-900">{role.name}</strong><span className="text-xs text-slate-500">{role.permissions?.length || 0} permissions</span></span><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${role.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{role.active ? 'Active' : 'Inactive'}</span></button>)}</div></section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between gap-3"><h3 className="font-bold text-slate-900">Platform operators</h3><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search operators" className="h-9 rounded-lg border border-slate-300 px-3 text-sm" /></div><form onSubmit={inviteUser} className="mt-4 rounded-xl bg-indigo-50 p-3"><div className="flex gap-2"><input required type="email" value={invite.email} onChange={event=>setInvite(value=>({...value,email:event.target.value}))} placeholder="operator@company.com" className="h-10 min-w-0 flex-1 rounded-lg border px-3 text-sm"/><button disabled={!invite.roleIds.length} className="rounded-lg bg-indigo-600 px-3 text-xs font-bold text-white disabled:opacity-40">Invite with MFA</button></div><div className="mt-2 flex flex-wrap gap-2">{roles.filter(role=>role.active).map(role=><label key={role._id} className="text-xs text-indigo-800"><input type="checkbox" className="mr-1" checked={invite.roleIds.includes(role._id)} onChange={()=>setInvite(value=>({...value,roleIds:value.roleIds.includes(role._id)?value.roleIds.filter(id=>id!==role._id):[...value.roleIds,role._id]}))}/>{role.name}</label>)}</div></form><div className="mt-4 divide-y divide-slate-100">{visibleUsers.map(user => <div key={user._id} className="grid gap-3 py-4 md:grid-cols-[1fr_1.4fr] md:items-center"><button onClick={()=>openUser(user)} className="text-left"><p className="text-sm font-bold text-slate-900">{user.firstName} {user.lastName} {!user.isActive&&<span className="text-xs text-red-600">Suspended</span>}</p><p className="text-xs text-slate-500">{user.email} · inspect sessions and history</p></button><div className="flex flex-wrap gap-2">{roles.filter(role => role.active).map(role => { const checked = user.platformRoleIds?.some(item => item._id === role._id); return <label key={role._id} className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold ${checked ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600'}`}><input type="checkbox" className="mr-1.5" checked={checked} onChange={() => updateUserRoles(user, checked ? user.platformRoleIds.filter(item => item._id !== role._id).map(item => item._id) : [...(user.platformRoleIds || []).map(item => item._id), role._id])} />{role.name}</label>; })}</div></div>)}</div></section>
    </div>

    {selectedRole && <form onSubmit={saveRole} className="rounded-2xl border border-indigo-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-slate-900">{selectedRole._id ? `Edit ${selectedRole.name}` : 'Create role'}</h3><p className="text-xs text-slate-500">Changes take effect on the operator's next API request.</p></div><button type="button" onClick={() => setSelectedRole(null)} className="text-sm text-slate-500">Close</button></div><div className="mt-4 grid gap-3 md:grid-cols-2"><input required value={selectedRole.name} onChange={event => setSelectedRole(role => ({ ...role, name: event.target.value }))} placeholder="Role name" className="h-10 rounded-lg border border-slate-300 px-3 text-sm" /><input value={selectedRole.description || ''} onChange={event => setSelectedRole(role => ({ ...role, description: event.target.value }))} placeholder="Description" className="h-10 rounded-lg border border-slate-300 px-3 text-sm" /></div><div className="mt-5 grid gap-4 lg:grid-cols-3">{Object.entries(grouped).map(([group, items]) => <fieldset key={group} className="rounded-xl border border-slate-200 p-3"><legend className="px-1 text-xs font-bold uppercase text-slate-500">{group}</legend>{items.map(permission => <label key={permission.key} className="mt-2 flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" checked={selectedRole.permissions.includes(permission.key)} onChange={() => togglePermission(permission.key)} className="mt-1" /><span>{permission.label}<code className="block text-[10px] text-slate-400">{permission.key}</code></span></label>)}</fieldset>)}</div><button disabled={saving} className="mt-5 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save role'}</button></form>}
    {details&&<section className="rounded-2xl border border-indigo-200 bg-white p-5"><div className="flex justify-between"><div><h3 className="font-extrabold">{details.user.firstName} {details.user.lastName}</h3><p className="text-xs text-slate-500">{details.user.email} · MFA {details.mfa?.enabled?'enabled':'not enrolled'}</p></div><button onClick={()=>setDetails(null)} className="text-sm text-slate-500">Close</button></div><div className="mt-4 flex flex-wrap gap-2">{details.user.isActive?<button onClick={()=>userAction(details.user,'suspend')} className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">Suspend + logout</button>:<button onClick={()=>userAction(details.user,'reactivate')} className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">Reactivate</button>}<button onClick={()=>userAction(details.user,'password-reset')} className="rounded-lg bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700">Send password reset</button><button onClick={()=>userAction(details.user,'mfa-reset')} className="rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700">Reset MFA + sessions</button><button onClick={()=>userAction(details.user,'delete','delete')} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white">Delete account</button></div><div className="mt-5 grid gap-5 lg:grid-cols-2"><div><h4 className="text-xs font-bold uppercase text-slate-500">Recent sessions</h4><div className="mt-2 divide-y rounded-lg border">{details.sessions.map(session=><div key={session._id} className="p-3 text-xs"><strong>{session.device?.label||session.deviceLabel||'Unknown device'}</strong><p className="text-slate-500">{session.ip} · last seen {new Date(session.lastSeenAt).toLocaleString()} · {session.revokedAt?'revoked':'active'}</p></div>)}</div></div><div><h4 className="text-xs font-bold uppercase text-slate-500">Authentication history</h4><div className="mt-2 divide-y rounded-lg border">{details.events.slice(0,20).map(event=><div key={event._id} className="p-3 text-xs"><strong>{event.eventType} · {event.outcome}</strong><p className="text-slate-500">{event.reason||event.authMethod} · {new Date(event.occurredAt).toLocaleString()}</p></div>)}</div></div></div></section>}
  </div>;
}
