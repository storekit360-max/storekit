/**
 * ─── StoreKit User Model ──────────────────────────────────────────────────────
 * models/User.js
 *
 * SECURITY CHANGES vs original:
 *  • Added loginAttempts (Number, default 0) — tracks consecutive failed logins.
 *  • Added lockUntil (Date, default null)    — when non-null and in the future,
 *    the account is locked and login is refused.
 *
 * BACKWARD COMPATIBILITY:
 *  • Both new fields have defaults so existing documents in MongoDB work without
 *    a migration: loginAttempts defaults to 0, lockUntil defaults to null.
 *  • All other fields, hooks, and methods are IDENTICAL to the original.
 *  • The password pre-save bcrypt hook is unchanged.
 *  • comparePassword() is unchanged.
 *
 * HOW LOCKOUT WORKS:
 *  1. Every failed login calls recordFailedLogin() in middleware/auth.js.
 *     It increments loginAttempts; when it reaches MAX_FAILED_ATTEMPTS (5)
 *     it sets lockUntil = now + 15 minutes.
 *  2. Every successful login calls clearFailedLogin(), resetting both fields.
 *  3. The login route checks isAccountLocked() before comparing passwords.
 *  4. Locks expire automatically — no cron job or manual reset needed.
 */

'use strict';

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema({
  firstName:  { type: String, required: true },
  lastName:   { type: String, default: '' },
  username:   { type: String, required: true, unique: true },
  email:      { type: String, required: true, unique: true },
  password:   { type: String, required: true },
  phone:      { type: String },
  role:       { type: String, enum: ['customer', 'admin', 'superadmin'], default: 'customer' },
  tenantId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  isActive:   { type: Boolean, default: true },
  isVerified: { type: Boolean, default: false },
  googleId:   { type: String, default: null },
  addresses: [{
    label:     String,
    country:   String,
    street:    String,
    city:      String,
    isDefault: { type: Boolean, default: false },
  }],
  wishlist:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  avatar:    { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date },

  // ─── SECURITY: Account lockout fields ───────────────────────────────────
  // loginAttempts — count of consecutive failed login attempts.
  //   Reset to 0 on every successful login.
  //   Existing documents will read this as 0 (MongoDB sparse default).
  loginAttempts: { type: Number, default: 0 },

  // lockUntil — if set and in the future, the account is locked.
  //   null means "not locked".  Expires automatically when the date passes.
  lockUntil: { type: Date, default: null },
});

// ─── Password hashing hook ────────────────────────────────────────────────────
// UNCHANGED from original.
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// ─── Password comparison method ───────────────────────────────────────────────
// UNCHANGED from original.
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);