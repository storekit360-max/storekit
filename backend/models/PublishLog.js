/**
 * models/PublishLog.js
 *
 * Immutable audit log — one document per platform publish attempt.
 * Retries create a NEW document linked via originalLogId.
 * This lets us see the full history of every attempt in the admin UI.
 */
const mongoose = require('mongoose');

const publishLogSchema = new mongoose.Schema(
  {
    // ── What fired this ─────────────────────────────────────────────────────
    trigger: {
      type:    String,
      enum:    ['new_product', 'product_discount', 'offer_active', 'manual'],
      default: 'manual',
    },
    // 'system' for automation, 'admin:<userId>' for manual/retry
    triggeredBy: { type: String, default: 'system' },

    // ── Target ──────────────────────────────────────────────────────────────
    platform: {
      type:     String,
      enum:     ['facebook', 'instagram', 'tiktok', 'whatsapp', 'telegram'],
      required: true,
    },

    // ── Source entity ────────────────────────────────────────────────────────
    entityType: { type: String, enum: ['product', 'offer', 'custom'], default: 'product' },
    entityId:   { type: mongoose.Schema.Types.ObjectId, default: null },
    entityName: { type: String, default: '' },

    // ── Composed content snapshot ────────────────────────────────────────────
    postText:  { type: String, default: '' },
    imageUrl:  { type: String, default: '' },

    // ── Outcome ──────────────────────────────────────────────────────────────
    status:         { type: String, enum: ['success', 'failed'], required: true },
    platformPostId: { type: String, default: '' }, // ID returned by the platform on success
    errorMessage:   { type: String, default: '' },
    errorCode:      { type: String, default: '' },

    // ── Retry tracking ───────────────────────────────────────────────────────
    attemptNumber: { type: Number, default: 1 },
    isRetry:       { type: Boolean, default: false },
    originalLogId: { type: mongoose.Schema.Types.ObjectId, default: null },

    // ── Performance ──────────────────────────────────────────────────────────
    durationMs: { type: Number, default: 0 },
  },
  { timestamps: true }
);

publishLogSchema.index({ status: 1, createdAt: -1 });
publishLogSchema.index({ platform: 1, createdAt: -1 });
publishLogSchema.index({ trigger: 1, createdAt: -1 });
publishLogSchema.index({ entityId: 1 });
publishLogSchema.index({ originalLogId: 1 });

module.exports = mongoose.model('PublishLog', publishLogSchema);