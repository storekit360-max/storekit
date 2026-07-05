import React, { useEffect, useState, useCallback } from 'react';
import API from '../../utils/api';
import toast from 'react-hot-toast';

const DESIGNS = [
  { id:'default',     emoji:'🎁', label:'Classic Gift',  bg:'linear-gradient(135deg,#15803d,#84cc16)' },
  { id:'birthday',    emoji:'🎂', label:'Birthday',      bg:'linear-gradient(135deg,#7c3aed,#a78bfa)' },
  { id:'christmas',   emoji:'🎄', label:'Christmas',     bg:'linear-gradient(135deg,#15803d,#84cc16)' },
  { id:'anniversary', emoji:'💝', label:'Anniversary',   bg:'linear-gradient(135deg,#be185d,#fb7185)' },
  { id:'thankyou',    emoji:'💙', label:'Thank You',     bg:'linear-gradient(135deg,#0369a1,#06b6d4)' },
];

const QUICK_AMOUNTS = [500, 1000, 2000, 5000, 10000];

// ── Slip Viewer Modal ─────────────────────────────────────────────────────────
function SlipModal({ card, onClose, onApprove, onReject }) {
  const [rejecting, setRejecting]       = useState(false);
  const [approving, setApproving]       = useState(false);
  // FIX: seed from card.isActive — re-opening an already-approved card
  // shows the "Approved" stamp immediately instead of the Approve button.
  const [approved,  setApproved]        = useState(!!card.isActive);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectionNote, setRejectionNote]  = useState('');
  const [adminNote, setAdminNote]          = useState('');

  const slipUrl = card.paymentSlip
    ? (card.paymentSlip.startsWith('http') ? card.paymentSlip : `${process.env.REACT_APP_API_URL || ''}${card.paymentSlip}`)
    : null;

  const isPdf = slipUrl && slipUrl.toLowerCase().endsWith('.pdf');

  const handleApprove = async () => {
    setApproving(true);
    try {
      await API.put(`/gift-cards/admin/${card._id}/approve`, { adminNote });
      toast.success('✅ Gift card approved & activated!');
      setApproved(true);
      setTimeout(() => { onApprove(); onClose(); }, 1400);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to approve');
    } finally { setApproving(false); }
  };

  const handleReject = async () => {
    setRejecting(true);
    try {
      await API.put(`/gift-cards/admin/${card._id}/reject`, { rejectionNote });
      toast.success('Slip rejected. Customer notified.');
      onReject();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reject');
    } finally { setRejecting(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-lg text-gray-900">Review Payment Slip</h3>
            <p className="text-xs text-gray-400 font-mono mt-0.5">{card.code} · Rs. {card.initialValue?.toLocaleString()}</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 text-gray-500 text-sm">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Customer info */}
          <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1">
            <div className="flex gap-2"><span className="text-gray-400 w-28 flex-shrink-0">Purchaser</span><span className="font-semibold text-gray-800">{card.purchaserName}</span></div>
            <div className="flex gap-2"><span className="text-gray-400 w-28 flex-shrink-0">Email</span><span className="text-gray-700">{card.purchaserEmail}</span></div>
            {card.recipientName && <div className="flex gap-2"><span className="text-gray-400 w-28 flex-shrink-0">Recipient</span><span className="text-gray-700">{card.recipientName} {card.recipientEmail ? `(${card.recipientEmail})` : ''}</span></div>}
            {card.paymentSlipUploadedAt && (
              <div className="flex gap-2"><span className="text-gray-400 w-28 flex-shrink-0">Uploaded</span><span className="text-gray-700">{new Date(card.paymentSlipUploadedAt).toLocaleString('en-LK')}</span></div>
            )}
            {card.slipDeadlineAt && (
              <div className="flex gap-2"><span className="text-gray-400 w-28 flex-shrink-0">Deadline was</span>
                <span className={new Date(card.slipDeadlineAt) < new Date() ? 'text-red-500 font-medium' : 'text-gray-700'}>
                  {new Date(card.slipDeadlineAt).toLocaleString('en-LK')}
                </span>
              </div>
            )}
          </div>

          {/* Slip preview */}
          {slipUrl ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Payment Slip</p>
                <div className="flex items-center gap-2">
                  <a href={slipUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                    Open
                  </a>
                  <a href={slipUrl} download
                    className="inline-flex items-center gap-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-2.5 py-1 rounded-lg transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                    Download
                  </a>
                </div>
              </div>
              {isPdf ? (
                <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
                  <iframe
                    src={`https://docs.google.com/viewer?url=${encodeURIComponent(slipUrl)}&embedded=true`}
                    title="Payment Slip PDF"
                    className="w-full"
                    style={{ height: '460px', border: 'none' }}
                  />
                  <div className="px-3 py-2 bg-white border-t border-gray-100 flex items-center gap-2">
                    <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>
                    <span className="text-xs text-gray-400">If the PDF doesn't load above, use the Open or Download buttons</span>
                  </div>
                </div>
              ) : (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <img src={slipUrl} alt="Payment slip"
                    className="w-full object-contain max-h-72"
                    onError={e => {
                      e.target.style.display = 'none';
                      e.target.nextSibling.style.display = 'flex';
                    }} />
                  <div style={{ display: 'none' }}
                    className="p-6 flex-col items-center justify-center text-center gap-2">
                    <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                    <p className="text-xs text-gray-400">Image could not load — use the Open or Download buttons above</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="border-2 border-dashed border-amber-300 rounded-xl p-6 text-center">
              <div className="text-3xl mb-2">⏳</div>
              <p className="text-sm text-amber-700 font-medium">No slip uploaded yet</p>
              <p className="text-xs text-gray-400 mt-1">Customer has not uploaded a payment slip.</p>
            </div>
          )}

          {/* Approve note */}
          {!showRejectForm && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Admin Note (optional)</label>
              <input value={adminNote} onChange={e => setAdminNote(e.target.value)}
                className="form-input text-sm" placeholder="e.g. Verified via bank statement" />
            </div>
          )}

          {/* Reject form */}
          {showRejectForm && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-red-700 mb-2">Reason for rejection (sent to customer)</p>
              <textarea value={rejectionNote} onChange={e => setRejectionNote(e.target.value)}
                rows={3} className="form-input resize-none text-sm"
                placeholder="e.g. Slip image is blurry, wrong amount transferred, reference not found..." />
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="p-5 border-t border-gray-100 space-y-2">
          {!showRejectForm ? (
            approved ? (
              /* ── Approved stamp shown after clicking approve ── */
              <div className="flex flex-col items-center justify-center py-3 gap-2">
                <div style={{
                  display:'inline-flex',alignItems:'center',gap:'10px',
                  background:'linear-gradient(135deg,#16a34a,#22c55e)',
                  color:'white',padding:'14px 28px',borderRadius:'14px',
                  fontWeight:900,fontSize:'18px',letterSpacing:'0.06em',
                  boxShadow:'0 6px 24px rgba(22,163,74,0.40)',
                  border:'3px solid #15803d',
                  transform:'rotate(-1.5deg)',
                  userSelect:'none',
                }}>
                  <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                  APPROVED
                </div>
                <p className="text-xs text-green-700 font-semibold mt-1">
                  {approving ? 'Gift card is now active — closing…' : 'This gift card has already been approved.'}
                </p>
              </div>
            ) : (
            <div className="flex gap-3">
              <button onClick={handleApprove} disabled={approving || !slipUrl}
                className="flex-1 py-2.5 rounded-xl bg-green-500 hover:bg-green-600 text-white text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {approving
                  ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Approving…</>
                  : '✅ Approve & Activate'}
              </button>
              <button onClick={() => setShowRejectForm(true)} disabled={!slipUrl}
                className="flex-1 py-2.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 text-sm font-bold border border-red-200 transition-colors disabled:opacity-50">
                ❌ Reject Slip
              </button>
            </div>
            )
          ) : (
            <div className="flex gap-3">
              <button onClick={() => setShowRejectForm(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50">
                Back
              </button>
              <button onClick={handleReject} disabled={rejecting}
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {rejecting
                  ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Sending…</>
                  : 'Send Rejection'}
              </button>
            </div>
          )}
          <button onClick={onClose}
            className="w-full py-2 rounded-xl text-xs text-gray-400 hover:text-gray-600 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Configurator Panel ────────────────────────────────────────────────────────
function ConfigPanel({ onClose }) {
  const [hours, setHours]     = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    API.get('/gift-cards/admin/config')
      .then(r => setHours(String(r.data.gcSlipDeadlineHours ?? 24)))
      .catch(() => setHours('24'))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    const n = Number(hours);
    if (isNaN(n) || n < 1) { toast.error('Enter a valid number of hours (min 1)'); return; }
    setSaving(true);
    try {
      await API.put('/gift-cards/admin/config', { gcSlipDeadlineHours: n });
      toast.success('✅ Configuration saved!');
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-bold text-lg text-gray-900">⚙️ Gift Card Settings</h3>
            <p className="text-xs text-gray-400 mt-0.5">Configure payment slip upload rules</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 text-gray-500">✕</button>
        </div>

        {loading ? (
          <div className="py-8 text-center text-gray-400">
            <div className="w-6 h-6 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto"
              style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent', borderWidth: 3 }} />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Deadline hours */}
            <div>
              <label className="form-label">Payment Slip Upload Deadline (hours) *</label>
              <p className="text-xs text-gray-400 mb-2">
                After a customer purchases a gift card, they must upload a bank transfer slip within this
                many hours. If they don't, the purchase is automatically cancelled and they receive an email.
              </p>
              <div className="flex gap-2 flex-wrap mb-3">
                {[6, 12, 24, 48, 72].map(h => (
                  <button key={h} type="button" onClick={() => setHours(String(h))}
                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold border-2 transition-all ${
                      String(hours) === String(h)
                        ? 'text-white border-transparent'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                    style={String(hours) === String(h) ? { background: 'var(--theme-gradient)', borderColor: 'transparent' } : {}}>
                    {h}h
                  </button>
                ))}
              </div>
              <input type="number" min="1" value={hours} onChange={e => setHours(e.target.value)}
                className="form-input" placeholder="Custom hours (e.g. 36)" />
            </div>

            {/* Info box */}
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-700 space-y-1.5">
              <p className="font-semibold">How it works:</p>
              <p>1. Customer purchases a gift card → clock starts ticking.</p>
              <p>2. Customer uploads their bank transfer slip in <strong>My Orders → Gift Card Purchases</strong>.</p>
              <p>3. You review the slip here and <strong>Approve</strong> or <strong>Reject</strong>.</p>
              <p>4. If no slip is uploaded by the deadline, the order is cancelled and the customer gets an email.</p>
            </div>

            <div className="flex gap-3 pt-2 border-t border-gray-100">
              <button onClick={save} disabled={saving} className="btn-primary flex-1">
                {saving ? 'Saving…' : '💾 Save Settings'}
              </button>
              <button onClick={onClose} className="btn-outline px-5">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Admin GiftCards Page ─────────────────────────────────────────────────
export default function AdminGiftCards() {
  const [cards, setCards]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [selectedCard, setSelectedCard] = useState(null); // for slip review modal
  const [saving, setSaving]         = useState(false);
  const [filter, setFilter]         = useState('all');
  const [form, setForm] = useState({
    amount: '',
    design: 'default',
    expiryDays: 365,
    isActive: true,
    adminNote: '',
  });

  const fetchCards = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await API.get(`/gift-cards/admin/all?status=${filter}`);
      setCards(data.cards || []);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { fetchCards(); }, [fetchCards]);

  const createCard = async () => {
    if (!form.amount || Number(form.amount) < 1) { toast.error('Enter a valid amount'); return; }
    setSaving(true);
    try {
      await API.post('/gift-cards/admin/create', {
        amount: Number(form.amount),
        design: form.design,
        expiryDays: Number(form.expiryDays) || 365,
        isActive: form.isActive,
        adminNote: form.adminNote || 'Admin created',
      });
      toast.success('🎁 Gift card created!');
      setShowCreate(false);
      setForm({ amount: '', design: 'default', expiryDays: 365, isActive: true, adminNote: '' });
      fetchCards();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally { setSaving(false); }
  };

  const activate = async (id) => {
    await API.put(`/gift-cards/admin/${id}/activate`);
    toast.success('Activated ✅');
    fetchCards();
  };

  const deactivate = async (id) => {
    await API.put(`/gift-cards/admin/${id}/deactivate`);
    toast.success('Disabled');
    fetchCards();
  };

  const adjustBalance = async (id, cur) => {
    const val = prompt(`Current balance: Rs. ${cur}\nEnter new balance (Rs.):`);
    if (val === null || val === '') return;
    const n = Number(val);
    if (isNaN(n) || n < 0) { toast.error('Invalid amount'); return; }
    await API.put(`/gift-cards/admin/${id}`, { balance: n });
    toast.success('Balance updated!');
    fetchCards();
  };

  const copy = (code) => { navigator.clipboard.writeText(code); toast.success('Copied!'); };

  const d = (id) => DESIGNS.find(x => x.id === id) || DESIGNS[0];

  const stats = {
    total:       cards.length,
    active:      cards.filter(c => c.isActive).length,
    pending:     cards.filter(c => !c.isActive && c.paymentStatus === 'pending' && !c.paymentExpired).length,
    slipPending: cards.filter(c => c.paymentSlip && !c.isActive).length,
    value:       cards.filter(c => c.isActive).reduce((s, c) => s + (c.balance || 0), 0),
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-gray-900">Gift Cards</h2>
          <p className="text-sm text-gray-500">Create and manage gift cards for the store</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowConfig(true)}
            className="btn-outline text-sm flex items-center gap-1.5">⚙️ Settings</button>
          <button onClick={() => setShowCreate(true)} className="btn-primary text-sm">+ Create Gift Card</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        {[
          { icon: '🎁', val: stats.total,                     lbl: 'Total Cards' },
          { icon: '✅', val: stats.active,                    lbl: 'Active' },
          { icon: '⏳', val: stats.pending,                   lbl: 'Awaiting Slip' },
          { icon: '📎', val: stats.slipPending,               lbl: 'Slip Uploaded' },
          { icon: '💰', val: `Rs. ${stats.value.toLocaleString()}`, lbl: 'Active Balance' },
        ].map(s => (
          <div key={s.lbl} className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
            <div className="text-2xl mb-1">{s.icon}</div>
            <p className="text-lg font-bold text-gray-900">{s.val}</p>
            <p className="text-xs text-gray-400">{s.lbl}</p>
          </div>
        ))}
      </div>

      {/* Slip-uploaded alert banner */}
      {stats.slipPending > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5">
          <span className="text-xl">📎</span>
          <p className="text-sm text-amber-800 font-medium flex-1">
            <strong>{stats.slipPending} gift card{stats.slipPending > 1 ? 's' : ''}</strong> have payment slips awaiting your review.
            Use the <strong>Review Slip</strong> button to approve or reject.
          </p>
          <button onClick={() => setFilter('slip_uploaded')}
            className="text-xs font-bold text-amber-700 hover:text-amber-900 underline whitespace-nowrap">
            View All →
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {[['all','All'],['active','Active'],['pending','Pending'],['slip_uploaded','Slip Uploaded'],['used','Used']].map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${filter === v ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            style={filter === v ? { background: 'var(--color-primary)' } : {}}>
            {l}
            {v === 'slip_uploaded' && stats.slipPending > 0 && (
              <span className="ml-1.5 bg-amber-400 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {stats.slipPending}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Modals */}
      {showConfig && <ConfigPanel onClose={() => setShowConfig(false)} />}

      {selectedCard && (
        <SlipModal
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
          onApprove={fetchCards}
          onReject={fetchCards}
        />
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md scale-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-bold text-lg text-gray-900">Create Gift Card</h3>
                <p className="text-xs text-gray-400 mt-0.5">Card will appear on the storefront for customers to purchase</p>
              </div>
              <button onClick={() => setShowCreate(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 text-gray-500">✕</button>
            </div>

            <div className="space-y-4">
              {/* Amount */}
              <div>
                <label className="form-label">Gift Card Value (Rs.) *</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {QUICK_AMOUNTS.map(a => (
                    <button key={a} type="button"
                      onClick={() => setForm(p => ({ ...p, amount: String(a) }))}
                      className={`px-3 py-1.5 rounded-lg text-sm font-semibold border-2 transition-all ${String(form.amount) === String(a) ? 'text-white border-transparent' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                      style={String(form.amount) === String(a) ? { background: 'var(--theme-gradient)', borderColor: 'transparent' } : {}}>
                      Rs. {a >= 1000 ? `${a / 1000}K` : a}
                    </button>
                  ))}
                </div>
                <input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                  className="form-input" placeholder="Or enter custom amount" />
              </div>

              {/* Design */}
              <div>
                <label className="form-label">Card Design</label>
                <div className="grid grid-cols-5 gap-2 mt-1">
                  {DESIGNS.map(ds => (
                    <button key={ds.id} type="button" onClick={() => setForm(p => ({ ...p, design: ds.id }))}
                      className={`aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5 border-2 transition-all ${form.design === ds.id ? 'border-primary scale-105 shadow-lg' : 'border-transparent hover:scale-102'}`}
                      style={{ background: ds.bg, borderColor: form.design === ds.id ? 'white' : 'transparent', boxShadow: form.design === ds.id ? '0 0 0 3px var(--color-primary)' : 'none' }}>
                      <span className="text-xl">{ds.emoji}</span>
                      <span className="text-white text-[9px] font-bold leading-none">{ds.label.split(' ')[0]}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div className="rounded-xl overflow-hidden" style={{ background: DESIGNS.find(x => x.id === form.design)?.bg || 'linear-gradient(135deg,#15803d,#84cc16)' }}>
                <div className="p-4 text-white text-center">
                  <div className="text-3xl mb-1">{DESIGNS.find(x => x.id === form.design)?.emoji || '🎁'}</div>
                  <p className="font-bold text-lg" style={{ fontFamily: 'var(--font-display)' }}>{DESIGNS.find(x => x.id === form.design)?.label}</p>
                  <p className="text-2xl font-black mt-1">Rs. {form.amount ? Number(form.amount).toLocaleString() : '—'}</p>
                  <p className="text-white/70 text-xs mt-1 font-mono tracking-widest">GC-XXXX-XXXX-XXXX</p>
                </div>
              </div>

              {/* Settings */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Valid for (days)</label>
                  <input type="number" value={form.expiryDays} onChange={e => setForm(p => ({ ...p, expiryDays: e.target.value }))} className="form-input" />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <div onClick={() => setForm(p => ({ ...p, isActive: !p.isActive }))}
                      className={`w-10 h-5 rounded-full relative cursor-pointer transition-all flex-shrink-0 ${form.isActive ? 'bg-primary' : 'bg-gray-200'}`}
                      style={{ background: form.isActive ? 'var(--color-primary)' : undefined }}>
                      <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 shadow-sm transition-all`} style={{ left: form.isActive ? 22 : 2 }} />
                    </div>
                    <span className="text-sm font-medium text-gray-700">Active now</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="form-label">Admin Note (optional)</label>
                <input value={form.adminNote} onChange={e => setForm(p => ({ ...p, adminNote: e.target.value }))}
                  className="form-input text-sm" placeholder="e.g. Holiday promo batch" />
              </div>

              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-700">
                💡 A unique code like <strong className="font-mono">GC-XXXX-XXXX-XXXX</strong> is auto-generated. Customers visit the Gift Cards page to purchase. Code is activated after payment.
              </div>
            </div>

            <div className="flex gap-3 mt-5 pt-4 border-t border-gray-100">
              <button onClick={createCard} disabled={saving} className="btn-primary flex-1">
                {saving ? 'Creating...' : '🎁 Create Gift Card'}
              </button>
              <button onClick={() => setShowCreate(false)} className="btn-outline px-5">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto"
              style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent', borderWidth: 3 }} />
          </div>
        ) : cards.length === 0 ? (
          <div className="p-16 text-center">
            <div className="text-5xl mb-3">🎁</div>
            <p className="text-gray-500 font-medium mb-1">No gift cards yet</p>
            <p className="text-gray-400 text-sm mb-4">Create gift cards for customers to browse and purchase on the storefront</p>
            <button onClick={() => setShowCreate(true)} className="btn-primary text-sm">Create First Gift Card</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Design</th>
                  <th>Value / Balance</th>
                  <th>Purchased By</th>
                  <th>Payment</th>
                  <th>Slip</th>
                  <th>Status</th>
                  <th>Expires</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {cards.map(card => {
                  const design = d(card.design);
                  const pct = Math.max(0, Math.round((card.balance / card.initialValue) * 100));
                  const hasSlip = !!card.paymentSlip;
                  const needsReview = hasSlip && !card.isActive && !card.paymentExpired;
                  const isExpired = card.paymentExpired;

                  return (
                    <tr key={card._id} className={needsReview ? 'bg-amber-50/40' : isExpired ? 'bg-red-50/30 opacity-70' : ''}>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <code className="font-mono text-xs font-bold px-2 py-0.5 rounded-lg"
                            style={{ color: 'var(--color-primary)', background: 'var(--color-primary)18' }}>
                            {card.code}
                          </code>
                          <button onClick={() => copy(card.code)} title="Copy code"
                            className="text-gray-300 hover:text-gray-500 transition-colors text-sm">📋</button>
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0" style={{ background: design.bg }}>
                            {design.emoji}
                          </div>
                          <span className="text-xs text-gray-500 hidden sm:block">{design.label}</span>
                        </div>
                      </td>
                      <td>
                        <p className="text-sm font-bold text-gray-900">
                          Rs. {card.balance?.toLocaleString()}
                          <span className="text-gray-400 font-normal text-xs ml-1">/ {card.initialValue?.toLocaleString()}</span>
                        </p>
                        <div className="w-24 bg-gray-100 rounded-full h-1 mt-1">
                          <div className="h-1 rounded-full transition-all"
                            style={{ width: `${pct}%`, background: pct > 50 ? 'var(--color-primary)' : pct > 20 ? '#f59e0b' : '#ef4444' }} />
                        </div>
                      </td>
                      <td>
                        {card.purchasedBy ? (
                          <div>
                            <p className="text-sm font-medium text-gray-800">{card.purchasedBy.firstName} {card.purchasedBy.lastName}</p>
                            <p className="text-xs text-gray-400">{card.purchasedBy.email}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 italic">Not purchased yet</span>
                        )}
                      </td>
                      <td>
                        <span className={`badge text-xs ${card.paymentStatus === 'paid' ? 'badge-new' : card.paymentStatus === 'failed' ? 'bg-red-100 text-red-500' : 'badge-sale'}`}>
                          {card.paymentStatus}
                        </span>
                      </td>
                      <td>
                        {card.isActive && hasSlip ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full"
                            style={{background:'linear-gradient(135deg,#16a34a,#22c55e)',color:'white',boxShadow:'0 2px 8px rgba(22,163,74,0.30)'}}>
                            <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                            Approved
                          </span>
                        ) : hasSlip ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                            📎 Uploaded
                          </span>
                        ) : isExpired ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold bg-red-100 text-red-500 px-2 py-0.5 rounded-full">
                            ⏰ Expired
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td>
                        <span className={`badge text-xs ${card.isActive ? 'badge-new' : isExpired ? 'bg-red-100 text-red-500' : card.paymentStatus === 'pending' ? 'badge-sale' : 'bg-gray-100 text-gray-500'}`}>
                          {card.isActive ? '✓ Active' : isExpired ? '⏰ Expired' : card.paymentStatus === 'pending' ? '⏳ Pending' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <span className="text-xs text-gray-400">{card.expiresAt ? new Date(card.expiresAt).toLocaleDateString() : '—'}</span>
                        {card.slipDeadlineAt && !card.isActive && !card.paymentExpired && (
                          <p className="text-[10px] text-amber-600 mt-0.5">
                            Slip by {new Date(card.slipDeadlineAt).toLocaleDateString()}
                          </p>
                        )}
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1 flex-wrap">
                          {/* Review slip button — prominent when slip uploaded */}
                          {needsReview && (
                            <button onClick={() => setSelectedCard(card)}
                              className="text-xs px-2.5 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 font-bold whitespace-nowrap animate-pulse-slow">
                              🔍 Review Slip
                            </button>
                          )}
                          {/* View slip if active but want to see it */}
                          {hasSlip && card.isActive && (
                            <button onClick={() => setSelectedCard(card)}
                              className="text-xs px-2 py-1 rounded-lg bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200 whitespace-nowrap">
                              📎 View Slip
                            </button>
                          )}
                          {!card.isActive && !needsReview && (
                            <button onClick={() => activate(card._id)}
                              className="text-xs px-2 py-1 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 font-medium whitespace-nowrap">
                              Activate
                            </button>
                          )}
                          {card.isActive && (
                            <button onClick={() => deactivate(card._id)}
                              className="text-xs px-2 py-1 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 whitespace-nowrap">
                              Disable
                            </button>
                          )}
                          <button onClick={() => adjustBalance(card._id, card.balance)}
                            className="text-xs px-2 py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 whitespace-nowrap">
                            Adjust
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}