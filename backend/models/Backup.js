'use strict';

const mongoose = require('mongoose');

const backupSchema = new mongoose.Schema({
  type:         { type: String, enum: ['manual', 'daily', 'weekly', 'monthly'], required: true },
  status:       { type: String, enum: ['running', 'completed', 'failed', 'verified'], default: 'running' },
  label:        { type: String },                      // human-readable name
  driveFileId:  { type: String },                      // Google Drive file id
  driveFileUrl: { type: String },                      // webViewLink
  sizeBytes:    { type: Number, default: 0 },
  collections:  { type: [String], default: [] },       // collections included
  docCount:     { type: Number, default: 0 },          // total docs backed up
  checksum:     { type: String },                      // SHA-256 of the archive
  error:        { type: String },                      // error message if failed
  duration:     { type: Number, default: 0 },          // ms
  startedAt:    { type: Date, default: Date.now },
  completedAt:  { type: Date },
  verifiedAt:   { type: Date },
  triggeredBy:  { type: String, default: 'system' },   // 'system' | admin email
}, { timestamps: true });

backupSchema.index({ type: 1, createdAt: -1 });
backupSchema.index({ status: 1 });

module.exports = mongoose.model('Backup', backupSchema);