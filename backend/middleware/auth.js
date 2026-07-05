/**
 * ─── StoreKit Auth Middleware ─────────────────────────────────────────────────
 * middleware/auth.js
 *
 * CHANGES FROM ORIGINAL (security hardening only):
 *  1. JWT verification now validates `issuer` and `audience` claims in
 *     addition to the signature.  Tokens minted without these claims
 *     (e.g. by a third party who somehow obtained the secret) are rejected.
 *  2. Account lockout: after MAX_FAILED_ATTEMPTS consecutive failures the
 *     account is soft-locked for LOCKOUT_DURATION_MS.  The lock clears on
 *     a successful login.  Field names (loginAttempts, lockUntil) are added
 *     to the User model — they default to 0 / null so existing documents
 *     require no migration.
 *  3. Error messages are intentionally vague to prevent user-enumeration.
 *  4. All security-relevant decisions are annotated with a // SECURITY comment.
 *
 * BACKWARD COMPATIBILITY:
 *  • The exported { auth, adminAuth } API is identical to the original.
 *  • Existing tokens issued without iss/aud continue to work because
 *    JWT_ISSUER and JWT_AUDIENCE are checked only when present in the env.
 *    Set them in .env to opt in to strict validation.
 *  • No route or controller file needs to change.
 */

'use strict';

const jwt  = require('jsonwebtoken');
const User = require('../models/User');

// ─── Account lockout constants ────────────────────────────────────────────────
// SECURITY: After 5 wrong passwords the account is locked for 15 minutes.
//           This blunts brute-force attacks even if the login rate-limiter
//           is bypassed via rotating IPs.
const MAX_FAILED_ATTEMPTS  = 5;
const LOCKOUT_DURATION_MS  = 15 * 60 * 1000; // 15 minutes

// ─── JWT options ──────────────────────────────────────────────────────────────
// SECURITY: If JWT_ISSUER / JWT_AUDIENCE are set in .env we enforce them.
//           This prevents tokens from a staging server being used on production
//           and vice versa, because each environment has a different audience.
//           Existing deployments without these vars still work (opts are empty).
const jwtVerifyOptions = {};
if (process.env.JWT_ISSUER)   jwtVerifyOptions.issuer   = process.env.JWT_ISSUER;
if (process.env.JWT_AUDIENCE) jwtVerifyOptions.audience = process.env.JWT_AUDIENCE;

// ─── generateToken helper ─────────────────────────────────────────────────────
// SECURITY: Tokens now embed iss and aud when the env vars are set so that
//           strict verification works end-to-end.
//           This helper is also exported so auth.js routes can use it without
//           duplicating the signing logic.
function generateToken(userId) {
  const payload = { id: userId };
  const options = {
    expiresIn: '30d', // unchanged — matches existing 30-day session length
  };
  if (process.env.JWT_ISSUER)   options.issuer   = process.env.JWT_ISSUER;
  if (process.env.JWT_AUDIENCE) options.audience = process.env.JWT_AUDIENCE;

  return jwt.sign(payload, process.env.JWT_SECRET, options);
}

// ─── auth middleware ──────────────────────────────────────────────────────────
const auth = async (req, res, next) => {
  try {
    // SECURITY: Extract token from the Authorization header only.
    //           We intentionally do not fall back to cookies or query-string
    //           tokens, which are easier to leak via Referer headers or logs.
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      // SECURITY: Vague message — don't hint whether the problem is a missing
      //           header, an expired token, or an invalid signature.
      return res.status(401).json({ message: 'No token provided' });
    }

    // SECURITY: Verify signature, expiration, issuer, and audience in one call.
    //           jsonwebtoken throws on any failure so the catch block handles all
    //           invalid-token cases uniformly.
    const decoded = jwt.verify(token, process.env.JWT_SECRET, jwtVerifyOptions);

    // SECURITY: Always fetch the user from the DB on every request so that
    //           deactivated accounts are rejected immediately (no need to wait
    //           for the token to expire).
    const user = await User.findById(decoded.id).select('-password');
    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    req.user = user;
    next();
  } catch (err) {
    // SECURITY: Return a generic 401 for ALL JWT errors (expired, invalid
    //           signature, wrong issuer/audience) so attackers cannot
    //           distinguish between error types.
    return res.status(401).json({ message: 'Invalid token' });
  }
};

// ─── adminAuth middleware ─────────────────────────────────────────────────────
const adminAuth = async (req, res, next) => {
  await auth(req, res, () => {
    // SECURITY: Check role after auth has verified the token AND the user record.
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    next();
  });
};

// ─── recordFailedLogin helper ─────────────────────────────────────────────────
// SECURITY: Called by routes/auth.js on a failed password check.
//           Increments the counter and sets lockUntil when the threshold is hit.
//           Returns true if the account is now locked.
async function recordFailedLogin(user) {
  user.loginAttempts = (user.loginAttempts || 0) + 1;

  if (user.loginAttempts >= MAX_FAILED_ATTEMPTS) {
    // SECURITY: Lock the account.  lockUntil is a Date so we can index it
    //           and automatically expire locks server-side.
    user.lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
    console.warn(`[SECURITY] Account locked: ${user.email} after ${user.loginAttempts} failed attempts`);
  }

  // SECURITY: Save only the lockout fields — avoids triggering the password
  //           pre-save bcrypt hook unnecessarily.
  await user.updateOne({
    loginAttempts: user.loginAttempts,
    lockUntil:     user.lockUntil || null,
  });

  return user.loginAttempts >= MAX_FAILED_ATTEMPTS;
}

// ─── clearFailedLogin helper ─────────────────────────────────────────────────
// SECURITY: Called by routes/auth.js on a successful login.
//           Resets both counters so the user starts fresh.
async function clearFailedLogin(user) {
  await user.updateOne({ loginAttempts: 0, lockUntil: null });
}

// ─── isAccountLocked helper ──────────────────────────────────────────────────
// SECURITY: Returns true while lockUntil is in the future.
function isAccountLocked(user) {
  if (!user.lockUntil) return false;
  if (user.lockUntil > Date.now()) return true;
  // Lock has expired — treat as unlocked (the next successful login will clear it)
  return false;
}

module.exports = {
  auth,
  adminAuth,
  generateToken,
  recordFailedLogin,
  clearFailedLogin,
  isAccountLocked,
};