'use strict';

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  capturedAt: { type: Date, default: Date.now, required: true },
  instanceId: { type: String, required: true, index: true },
  process: {
    uptimeSeconds: Number, memoryRssMb: Number, heapUsedMb: Number, heapTotalMb: Number,
    externalMb: Number, cpuUserMs: Number, cpuSystemMs: Number, eventLoopLagMs: Number,
  },
  database: { status: String, readyState: Number, pingMs: Number },
  disk: { status: String, totalMb: Number, freeMb: Number, usedPercent: Number },
  api: { totalRequests: Number, totalErrors: Number, errorRate: Number, averageMs: Number, p95Ms: Number, requestsInWindow: Number },
  integrations: { healthy: Number, failed: Number, neverTested: Number, total: Number },
}, { versionKey: false });

schema.index({ capturedAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.models.MetricSnapshot || mongoose.model('MetricSnapshot', schema);
