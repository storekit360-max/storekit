const mongoose = require('mongoose');

// ─── Per-platform account sub-schema ─────────────────────────────────────────
const accountSchema = new mongoose.Schema({
  connected:      { type: Boolean, default: false },
  enabled:        { type: Boolean, default: false },
  // Identifiers visible to admins (never access tokens)
  accountId:      { type: String, default: '' },   // page/account/bot ID
  accountName:    { type: String, default: '' },   // human-readable display name
  accountHandle:  { type: String, default: '' },   // @handle or username
  accountAvatar:  { type: String, default: '' },   // profile picture URL
  // Encrypted credentials — NEVER sent to the frontend
  accessToken:    { type: String, default: '' },   // platform OAuth / API token
  accessSecret:   { type: String, default: '' },   // secondary secret if needed
  appId:          { type: String, default: '' },   // app/client id
  appSecret:      { type: String, default: '' },   // app/client secret
  extraConfig:    { type: mongoose.Schema.Types.Mixed, default: {} }, // platform-specific
  lastTested:     { type: Date, default: null },
  lastTestStatus: { type: String, enum: ['ok', 'error', ''], default: '' },
  lastTestMessage:{ type: String, default: '' },
  connectedAt:    { type: Date, default: null },

  // ── Token lifecycle fields ────────────────────────────────────────────────
  tokenExpiresAt:       { type: Date, default: null },   // when accessToken expires (null = unknown/permanent)
  tokenLastRefreshedAt: { type: Date, default: null },   // last successful auto-refresh timestamp
  tokenRefreshError:    { type: String, default: '' },   // last refresh error message (cleared on success)
  reconnectNeeded:      { type: Boolean, default: false }, // true when token is expired and auto-refresh failed
}, { _id: false });

// ─── Default post template sub-schema ────────────────────────────────────────
const templateSchema = new mongoose.Schema({
  platform:   { type: String, required: true },   // 'facebook' | 'instagram' | etc.
  template:   { type: String, default: '' },      // template text with {{variables}}
  hashtags:   { type: [String], default: [] },    // default hashtag list
  enabled:    { type: Boolean, default: true },
}, { _id: false });

// ─── Root document (one doc per shop) ────────────────────────────────────────
const socialMediaSchema = new mongoose.Schema({
  // platforms
  facebook:   { type: accountSchema, default: () => ({}) },
  instagram:  { type: accountSchema, default: () => ({}) },
  tiktok:     { type: accountSchema, default: () => ({}) },
  whatsapp:   { type: accountSchema, default: () => ({}) },
  telegram:   { type: accountSchema, default: () => ({}) },

  // which platforms are enabled for automated posting
  automationEnabled: { type: Boolean, default: false },
  enabledPlatforms:  { type: [String], default: [] },

  // default post templates per platform
  templates: { type: [templateSchema], default: [] },

  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('SocialMedia', socialMediaSchema);