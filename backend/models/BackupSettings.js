'use strict';

const mongoose = require('mongoose');

const backupSettingsSchema = new mongoose.Schema({
  _id: { type: String, default: 'backup_settings' },

  enabled:         { type: Boolean, default: true },

  // Schedule (cron-style hours in UTC)
  dailyHour:       { type: Number, default: 2 },
  weeklyDay:       { type: Number, default: 0 },
  weeklyHour:      { type: Number, default: 3 },
  monthlyDay:      { type: Number, default: 1 },
  monthlyHour:     { type: Number, default: 4 },

  // Retention
  retainDaily:     { type: Number, default: 14 },
  retainWeekly:    { type: Number, default: 8 },
  retainMonthly:   { type: Number, default: 12 },

  // Google Drive — folder
  driveFolder:     { type: String, default: 'StoreKit Backups' },
  driveFolderId:   { type: String },   // cached after first backup

  // Google Drive — OAuth2 tokens (stored instead of service account)
  oauthRefreshToken: { type: String },
  oauthAccessToken:  { type: String },
  oauthTokenExpiry:  { type: Number },
  oauthEmail:        { type: String },
  oauthConnectedAt:  { type: Date },

  // Alerts
  alertOnFailure:  { type: Boolean, default: true },
  alertEmail:      { type: String },

  // Last run timestamps
  lastDaily:       { type: Date },
  lastWeekly:      { type: Date },
  lastMonthly:     { type: Date },
}, { _id: false, timestamps: true });

module.exports = mongoose.model('BackupSettings', backupSettingsSchema);