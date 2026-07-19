'use strict';

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  ticket: { type: mongoose.Schema.Types.ObjectId, ref: 'SupportTicket', required: true, index: true },
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  kind: { type: String, enum: ['reply', 'internal_note', 'system', 'live_chat'], default: 'reply' },
  body: { type: String, required: true, trim: true, maxlength: 20000 },
  attachments: [{ name: { type: String, maxlength: 180 }, url: { type: String, maxlength: 2000 }, mimeType: { type: String, maxlength: 120 }, size: { type: Number, min: 0 } }],
}, { timestamps: true });

schema.index({ ticket: 1, createdAt: 1 });
schema.index({ tenant: 1, createdAt: -1 });
module.exports = mongoose.models.SupportMessage || mongoose.model('SupportMessage', schema);
