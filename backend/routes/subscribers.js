const express = require('express');
const router = express.Router();
const { Subscriber } = require('../models/index');
const { adminAuth } = require('../middleware/auth');
const Tenant = require('../models/Tenant');
const { requiredTenantId } = require('../utils/tenantGuard');
const { sendMail, subscriberConfirmationHtml } = require('../utils/mailer');

// Subscribe
router.post('/', async (req, res) => {
  try {
    const { email, name } = req.body;
    if (!email) return res.status(400).json({ message: 'Email required' });
    const normalizedEmail = String(email).trim().toLowerCase();
    const tenantId = requiredTenantId(req);
    const tenant = await Tenant.findById(tenantId).lean();
    const existing = await Subscriber.findOne({ tenantId, email: normalizedEmail });
    if (existing) { existing.isActive = true; await existing.save(); return res.json({ message: 'Already subscribed!' }); }
    await Subscriber.create({ tenantId, email: normalizedEmail, name, source: 'website' });
    const storeName = tenant?.storeName || 'Our Store';
    sendMail({
      to: normalizedEmail,
      tenantId,
      tenant,
      subject: `Welcome to ${storeName} — Subscription Confirmed`,
      html: await subscriberConfirmationHtml(name, { tenantId, tenant }),
    }).catch(err => console.error('[SUBSCRIBER] Confirmation email failed:', err.message));
    res.status(201).json({ message: 'Subscribed successfully!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Admin - All subscribers
router.get('/admin/all', adminAuth, async (req, res) => {
  try {
    const subscribers = await Subscriber.find().sort({ createdAt: -1 });
    res.json(subscribers);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Admin - Export CSV
router.get('/admin/export', adminAuth, async (req, res) => {
  try {
    const subscribers = await Subscriber.find({ isActive: true });
    const csv = 'Email,Name,Date\n' + subscribers.map(s => `${s.email},${s.name || ''},${new Date(s.createdAt).toLocaleDateString()}`).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=subscribers.csv');
    res.send(csv);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
