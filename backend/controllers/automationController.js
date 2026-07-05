/**
 * controllers/automationController.js
 */
const AutomationRule = require('../models/AutomationRule');
const PublishLog     = require('../models/PublishLog');
const { retryLog, manualPublish } = require('../services/publisherService');

const DEFAULT_RULES = [
  { trigger: 'new_product',      label: 'New Product Published',   description: 'Auto-post when a new product is added and active' },
  { trigger: 'product_discount', label: 'Product Discount Added',  description: 'Auto-post when a product sale price is set or changed' },
  { trigger: 'offer_active',     label: 'Offer / Campaign Active', description: 'Auto-post when a seasonal campaign is activated' },
];

// GET /api/automation/rules
exports.getRules = async (req, res) => {
  try {
    let rules = await AutomationRule.find().sort({ trigger: 1 });
    if (!rules.length) rules = await AutomationRule.insertMany(DEFAULT_RULES);
    res.json(rules);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// PUT /api/automation/rules/:trigger
exports.updateRule = async (req, res) => {
  try {
    const ALLOWED = ['enabled', 'platforms', 'delayMinutes', 'minDiscountPercent', 'customMessage'];
    const update  = {};
    ALLOWED.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
    const rule = await AutomationRule.findOneAndUpdate(
      { trigger: req.params.trigger },
      { $set: update },
      { new: true, upsert: true, runValidators: true }
    );
    res.json(rule);
  } catch (err) { res.status(400).json({ message: err.message }); }
};

// POST /api/automation/manual
exports.manualTrigger = async (req, res) => {
  try {
    const { trigger = 'manual', entityId, entityType = 'product', platforms = [], customMsg = '' } = req.body;
    if (!entityId)         return res.status(400).json({ message: '`entityId` is required' });
    if (!platforms.length) return res.status(400).json({ message: '`platforms` array is required' });

    const adminUserId = req.user?._id?.toString() || 'unknown';
    const results = await Promise.allSettled(
      platforms.map(platform => manualPublish({ platform, entityType, entityId, entityName: '', customMsg, trigger, adminUserId }))
    );

    const logs = results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
    res.json({
      total:   logs.length,
      success: logs.filter(l => l.status === 'success').length,
      failed:  logs.filter(l => l.status === 'failed').length,
      logs:    logs.map(l => ({ _id: l._id, platform: l.platform, status: l.status, errorMessage: l.errorMessage, platformPostId: l.platformPostId })),
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// POST /api/automation/retry/:logId
exports.retryLog = async (req, res) => {
  try {
    const adminUserId = req.user?._id?.toString() || 'unknown';
    const log = await retryLog(req.params.logId, adminUserId);
    res.json({ success: log.status === 'success', status: log.status, logId: log._id, platform: log.platform, errorMessage: log.errorMessage || null });
  } catch (err) { res.status(400).json({ message: err.message }); }
};

// GET /api/automation/logs
exports.getLogs = async (req, res) => {
  try {
    const { page = 1, limit = 25, platform, status, trigger } = req.query;
    const filter = {};
    if (platform) filter.platform = platform;
    if (status)   filter.status   = status;
    if (trigger)  filter.trigger  = trigger;

    const [total, logs] = await Promise.all([
      PublishLog.countDocuments(filter),
      PublishLog.find(filter).sort({ createdAt: -1 }).skip((+page - 1) * +limit).limit(+limit),
    ]);
    res.json({ logs, total, pages: Math.ceil(total / +limit) });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// GET /api/automation/logs/:id
exports.getLog = async (req, res) => {
  try {
    const log = await PublishLog.findById(req.params.id);
    if (!log) return res.status(404).json({ message: 'Log not found' });
    res.json(log);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// DELETE /api/automation/logs/:id
exports.deleteLog = async (req, res) => {
  try {
    await PublishLog.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// DELETE /api/automation/logs?status=failed
exports.clearLogs = async (req, res) => {
  try {
    const filter = req.query.status ? { status: req.query.status } : {};
    const { deletedCount } = await PublishLog.deleteMany(filter);
    res.json({ deletedCount });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// GET /api/automation/stats
exports.getStats = async (req, res) => {
  try {
    const [total, success, failed, byPlatform, byTrigger, recentFailed] = await Promise.all([
      PublishLog.countDocuments(),
      PublishLog.countDocuments({ status: 'success' }),
      PublishLog.countDocuments({ status: 'failed' }),
      PublishLog.aggregate([
        { $group: { _id: '$platform', total: { $sum: 1 }, success: { $sum: { $cond: [{ $eq: ['$status','success'] }, 1, 0] } } } },
        { $sort: { total: -1 } },
      ]),
      PublishLog.aggregate([
        { $group: { _id: '$trigger', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      PublishLog.find({ status: 'failed' }).sort({ createdAt: -1 }).limit(5)
        .select('platform trigger entityName errorMessage createdAt'),
    ]);
    res.json({ total, success, failed, byPlatform, byTrigger, recentFailed });
  } catch (err) { res.status(500).json({ message: err.message }); }
};