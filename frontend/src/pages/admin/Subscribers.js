import React, { useEffect, useState } from 'react';
import API from '../../utils/api';

export default function AdminSubscribers() {
  const [subscribers, setSubscribers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    API.get('/subscribers/admin/all').then(r => setSubscribers(r.data)).finally(() => setLoading(false));
  }, []);

  const exportCSV = () => {
    window.open('/api/subscribers/admin/export', '_blank');
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display text-xl font-bold text-gray-900">Newsletter Subscribers</h2>
          <p className="text-sm text-gray-500">{subscribers.filter(s=>s.isActive).length} active subscribers</p>
        </div>
        <button onClick={exportCSV} className="btn-outline text-sm">⬇️ Export CSV</button>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading ? <div className="p-12 text-center text-gray-400">Loading...</div> : subscribers.length === 0 ? (
          <div className="p-12 text-center"><div className="text-4xl mb-3">📭</div><p className="text-gray-400">No subscribers yet</p></div>
        ) : (
          <table className="data-table">
            <thead><tr><th>Email</th><th>Name</th><th>Source</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>
              {subscribers.map(s => (
                <tr key={s._id}>
                  <td><span className="font-medium text-sm">{s.email}</span></td>
                  <td><span className="text-sm text-gray-600">{s.name || '—'}</span></td>
                  <td><span className="badge badge-featured capitalize text-xs">{s.source}</span></td>
                  <td><span className={`badge text-xs ${s.isActive ? 'badge-new' : 'bg-gray-100 text-gray-500'}`}>{s.isActive ? 'Active' : 'Unsubscribed'}</span></td>
                  <td><span className="text-xs text-gray-400">{new Date(s.createdAt).toLocaleDateString()}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
