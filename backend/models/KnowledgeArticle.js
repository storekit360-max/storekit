'use strict';

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  title: { type: String, required: true, trim: true, maxlength: 180 },
  summary: { type: String, default: '', maxlength: 500 },
  body: { type: String, required: true, maxlength: 100000 },
  category: { type: String, default: 'general', lowercase: true, trim: true, maxlength: 80 },
  status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft', index: true },
  publishedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

schema.index({ status: 1, category: 1, updatedAt: -1 });
module.exports = mongoose.models.KnowledgeArticle || mongoose.model('KnowledgeArticle', schema);
