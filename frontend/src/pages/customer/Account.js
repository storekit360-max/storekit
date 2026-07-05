import React, { useEffect, useState } from 'react';
import useSEO from '../../hooks/useSEO';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import API from '../../utils/api';
import toast from 'react-hot-toast';

export default function Account() {
  const { user, updateUser } = useAuth();
  useSEO({ title: 'Account', noindex: true });
  const [tab, setTab] = useState('profile');
  const [profile, setProfile] = useState({ firstName: user?.firstName||'', lastName: user?.lastName||'', phone: '' });
  const [passwords, setPasswords] = useState({ newPassword:'', confirm:'' });
  const [saving, setSaving] = useState(false);
  const primary = 'var(--color-primary)';

  useEffect(() => {
    API.get('/auth/me')
      .then(r => setProfile(p => ({ ...p, firstName: r.data.firstName, lastName: r.data.lastName, phone: r.data.phone||'' })))
      .catch(() => {});
  }, []);

  const saveProfile = async () => {
    setSaving(true);
    try {
      const { data } = await API.put('/auth/profile', profile);
      updateUser(data);
      toast.success('Profile updated!');
    } catch { toast.error('Update failed'); }
    finally { setSaving(false); }
  };

  const changePassword = async () => {
    if (passwords.newPassword !== passwords.confirm) { toast.error('Passwords do not match'); return; }
    setSaving(true);
    try {
      await API.put('/auth/change-password', { newPassword: passwords.newPassword });
      toast.success('Password changed!');
      setPasswords({ newPassword:'', confirm:'' });
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8" style={{ background: 'var(--body-bg)' }}>
      {/* Profile header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-lg" style={{ background: 'var(--theme-gradient)' }}>
          {user?.firstName?.[0]}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>{user?.firstName} {user?.lastName}</h1>
          <p className="text-gray-500 text-sm">{user?.email}</p>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        <Link to="/my-orders" className="flex items-center gap-3 rounded-2xl border-2 p-4 hover:shadow-md transition-all group" style={{ borderColor: `${primary}30`, background: 'var(--card-bg)' }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: `${primary}15` }}>📦</div>
          <div>
            <p className="font-bold text-gray-900 text-sm">My Orders</p>
            <p className="text-xs text-gray-400">Track & manage orders</p>
          </div>
          <svg className="w-4 h-4 ml-auto text-gray-300 group-hover:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
        </Link>
        <button onClick={() => setTab('profile')} className="flex items-center gap-3 rounded-2xl border-2 p-4 hover:shadow-md transition-all group text-left w-full" style={{ borderColor: tab==='profile' ? primary : `${primary}30`, background: 'var(--card-bg)' }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: `${primary}15` }}>👤</div>
          <div>
            <p className="font-bold text-gray-900 text-sm">Profile</p>
            <p className="text-xs text-gray-400">Update your info</p>
          </div>
          <svg className="w-4 h-4 ml-auto text-gray-300 group-hover:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
        </button>
        <button onClick={() => setTab('security')} className="flex items-center gap-3 rounded-2xl border-2 p-4 hover:shadow-md transition-all group text-left w-full" style={{ borderColor: tab==='security' ? primary : `${primary}30`, background: 'var(--card-bg)' }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: `${primary}15` }}>🔒</div>
          <div>
            <p className="font-bold text-gray-900 text-sm">Security</p>
            <p className="text-xs text-gray-400">Change password</p>
          </div>
          <svg className="w-4 h-4 ml-auto text-gray-300 group-hover:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
        </button>
      </div>

      {/* Tabs */}
      {(tab === 'profile' || tab === 'security') && (
        <div className="flex gap-1 border-b border-gray-200 mb-8">
          {[['profile','Profile'],['security','Security']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-all ${tab === id ? '' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              style={tab === id ? { borderColor: primary, color: primary } : {}}>
              {label}
            </button>
          ))}
        </div>
      )}

      {tab === 'profile' && (
        <div className="max-w-lg">
          <div className="rounded-2xl border border-gray-100 p-6 space-y-4" style={{ background: 'var(--card-bg)' }}>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="form-label">First Name</label><input value={profile.firstName} onChange={e => setProfile(p => ({...p, firstName: e.target.value}))} className="form-input"/></div>
              <div><label className="form-label">Last Name</label><input value={profile.lastName} onChange={e => setProfile(p => ({...p, lastName: e.target.value}))} className="form-input"/></div>
            </div>
            <div><label className="form-label">Phone</label><input type="tel" value={profile.phone} onChange={e => setProfile(p => ({...p, phone: e.target.value}))} className="form-input"/></div>
            <div><label className="form-label">Email</label><input value={user?.email} disabled className="form-input bg-gray-50 text-gray-500"/></div>
            <button onClick={saveProfile} disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Save Changes'}</button>
          </div>
        </div>
      )}

      {tab === 'security' && (
        <div className="max-w-lg">
          <div className="rounded-2xl border border-gray-100 p-6 space-y-4" style={{ background: 'var(--card-bg)' }}>
            <div><label className="form-label">New Password</label><input type="password" value={passwords.newPassword} onChange={e => setPasswords(p => ({...p, newPassword: e.target.value}))} className="form-input"/></div>
            <div><label className="form-label">Confirm New Password</label><input type="password" value={passwords.confirm} onChange={e => setPasswords(p => ({...p, confirm: e.target.value}))} className="form-input"/></div>
            <button onClick={changePassword} disabled={saving} className="btn-primary">{saving ? 'Changing...' : 'Change Password'}</button>
          </div>
        </div>
      )}
    </div>
  );
}