/**
 * ─── StoreKit Auth Routes ─────────────────────────────────────────────────────
 * routes/auth.js
 *
 * SECURITY CHANGES vs original (all backward-compatible):
 *
 *  LOGIN (/api/auth/login):
 *   • Account lockout: checks isAccountLocked() before touching the password.
 *     After MAX_FAILED_ATTEMPTS wrong passwords the account is locked for 15 min.
 *   • recordFailedLogin() increments the counter on every bad password.
 *   • clearFailedLogin() resets counters on a successful login.
 *   • Timing-safe path: if the user doesn't exist we still call bcrypt.compare
 *     against a dummy hash to prevent timing attacks that reveal whether an
 *     email is registered.
 *   • Response messages remain exactly the same ("Invalid email or password")
 *     so no information is leaked to the client.
 *
 *  TOKEN GENERATION:
 *   • Uses the shared generateToken() from middleware/auth.js so issuer /
 *     audience claims are included when JWT_ISSUER / JWT_AUDIENCE env vars
 *     are set.  All existing tokens still work.
 *
 *  ERROR HANDLING:
 *   • catch blocks now pass errors to next() instead of sending raw err.message,
 *     so the global errorHandler can sanitise them before they reach the client.
 *
 *  EVERYTHING ELSE IS UNCHANGED:
 *   • /register, /google, /forgot-password, /verify-otp, /reset-password,
 *     /me, /profile, /change-password, /wishlist — identical behaviour.
 *   • All response shapes are identical.
 */

'use strict';

const express  = require('express');
const router   = express.Router();
const crypto   = require('crypto');
const bcrypt   = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const User     = require('../models/User');
const Tenant   = require('../models/Tenant');
const { auth, generateToken, recordFailedLogin, clearFailedLogin, isAccountLocked } = require('../middleware/auth');
const { Notification, OTP, Coupon } = require('../models/index');
const { sendMail, otpEmailHtml }    = require('../utils/mailer');
const { getHeaderDomainCandidates, normalizeDomain } = require('../middleware/tenant');
const { issueSession, recordAuthEvent, revokeAllUserSessions } = require('../services/authSessionService');
const AuthSession = require('../models/AuthSession');
const MfaFactor = require('../models/MfaFactor');
const { createChallengeToken, createEnrollment, getFactor, verifyChallengeToken, verifyFactor } = require('../services/mfaService');

// ─── DIAGNOSTIC GUARD ─────────────────────────────────────────────────────────
// A "Router.use() requires a middleware function" crash means one of the
// values below resolved to `undefined` instead of a function/model — usually
// a bad export path, a typo'd named export, or a circular require. Any
// router.get/post/put call below that receives `auth` as middleware will
// throw this exact Express error if `auth` came back undefined.
// This fails fast with a clear message naming the culprit instead of letting
// Express throw an opaque internal error with a misleading line number.
const __deps = { auth, generateToken, recordFailedLogin, clearFailedLogin, isAccountLocked, sendMail, otpEmailHtml };
for (const [name, val] of Object.entries(__deps)) {
  if (typeof val !== 'function') {
    throw new TypeError(
      `[routes/auth.js] "${name}" is ${val === undefined ? 'undefined' : typeof val}, expected a function. ` +
      `Check that middleware/auth.js / utils/mailer.js actually exports "${name}" and that the require() path ` +
      `above is correct (paths are case-sensitive on Linux/CI even when they work on macOS).`
    );
  }
}
{
  const missingModels = { Notification, OTP, Coupon };
  const missing = Object.keys(missingModels).filter(n => !missingModels[n]);
  if (missing.length) {
    throw new TypeError(`[routes/auth.js] Missing model export(s) from models/index.js: ${missing.join(', ')}`);
  }
}

// SECURITY: Use the shared generateToken so issuer/audience are embedded
//           when JWT_ISSUER / JWT_AUDIENCE are configured in .env.
// Customer login uses one explicit platform-level web client. Do not fall back
// to the Google Drive OAuth client: mixing those clients causes audience and
// authorized-origin mismatches that are difficult to diagnose.
const GOOGLE_LOGIN_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const googleClient = new OAuth2Client(GOOGLE_LOGIN_CLIENT_ID || undefined);
const GOOGLE_SUPERADMIN_CLIENT_ID = process.env.GOOGLE_SUPERADMIN_CLIENT_ID || GOOGLE_LOGIN_CLIENT_ID;
const superAdminGoogleClient = new OAuth2Client(GOOGLE_SUPERADMIN_CLIENT_ID || undefined);
const SUPERADMIN_GOOGLE_EMAILS = new Set(
  String(process.env.SUPERADMIN_GOOGLE_EMAILS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean)
);

// SECURITY: Pre-hashed dummy value used in timing-safe "user not found" path.
//           bcrypt.compare is slow by design — if we skip it when the user
//           doesn't exist, an attacker can detect non-existent emails by
//           measuring response time.
const DUMMY_HASH = '$2a$12$dummyhashtopreventtimingattacks.onloginendpoint.padded';

async function resolveTenantFromRequest(req) {
  const candidates = getHeaderDomainCandidates(req);
  if (!candidates.length) return null;
  return Tenant.findOne({
    status: 'active',
    domains: { $elemMatch: { domain: { $in: candidates }, active: true } },
  }).lean();
}

function parseWebOrigin(value) {
  try {
    const parsed = new URL(String(value || ''));
    if (!['https:', 'http:'].includes(parsed.protocol)) return null;
    if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') return null;
    return parsed.origin;
  } catch (_) {
    return null;
  }
}

function getGoogleBridgeUrl() {
  const explicit = String(process.env.GOOGLE_AUTH_BRIDGE_URL || '').trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const frontendOrigin = parseWebOrigin(process.env.FRONTEND_URL);
  return frontendOrigin ? `${frontendOrigin}/google-auth-bridge` : '';
}

async function getGoogleReturnStore(origin) {
  const parsedOrigin = parseWebOrigin(origin);
  if (!parsedOrigin) return null;
  const parsed = new URL(parsedOrigin);
  const domain = normalizeDomain(parsed.hostname);

  const tenant = await Tenant.findOne({
    status: 'active',
    domains: { $elemMatch: { domain: { $in: [domain, `www.${domain}`] }, active: true } },
  }).select('storeName settings.logoUrl').lean();
  if (tenant) {
    return {
      storeName: tenant.storeName || 'Your Store',
      logoUrl: tenant.settings?.logoUrl || '',
    };
  }

  const isLocal = process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(domain);
  const platformOrigin = parseWebOrigin(process.env.FRONTEND_URL);
  if (isLocal || (platformOrigin && parsedOrigin === platformOrigin)) {
    return { storeName: 'Online Store', logoUrl: '' };
  }

  return null;
}

function cleanUsernameBase(value, fallback = 'user') {
  return String(value || fallback).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20) || fallback;
}

async function makeUniqueUsername(baseValue, tenantId, excludeId = null) {
  const base = cleanUsernameBase(baseValue);
  let username = base;
  let attempt = 0;
  const filter = { tenantId: tenantId || null, username };
  if (excludeId) filter._id = { $ne: excludeId };

  while (await User.findOne(filter)) {
    attempt += 1;
    username = `${base}_${attempt}`;
    filter.username = username;
  }
  return username;
}

async function attachLegacyCustomerToTenant(user, tenantId) {
  if (!user || !tenantId || user.tenantId || user.role !== 'customer') return user;

  const usernameTaken = await User.findOne({
    tenantId,
    username: user.username,
    _id: { $ne: user._id },
  });
  if (usernameTaken) {
    user.username = await makeUniqueUsername(user.username || user.email?.split('@')[0], tenantId, user._id);
  }

  user.tenantId = tenantId;
  await user.save();
  return user;
}

// ─── Password strength validator ─────────────────────────────────────────────
// Returns { valid: Boolean, errors: String[] } — unchanged from original.
function validatePasswordStrength(password, settings = {}) {
  const errors = [];
  const minimum = Math.min(Math.max(Number(settings['security.passwordMinLength']) || 8, 8), 128);
  if (!password || password.length < minimum) errors.push(`At least ${minimum} characters`);
  if (settings['security.passwordRequireUppercase'] !== false && !/[A-Z]/.test(password)) errors.push('At least one uppercase letter (A-Z)');
  if (settings['security.passwordRequireLowercase'] !== false && !/[a-z]/.test(password)) errors.push('At least one lowercase letter (a-z)');
  if (settings['security.passwordRequireNumber'] !== false && !/[0-9]/.test(password)) errors.push('At least one number (0-9)');
  if (settings['security.passwordRequireSpecial'] !== false && !/[^A-Za-z0-9]/.test(password)) errors.push('At least one special character (!@#$%^&* etc.)');
  return { valid: errors.length === 0, errors };
}

// ─── Register ─────────────────────────────────────────────────────────────────
// UNCHANGED behaviour — security hardening via sanitisation middleware in
// security.js (XSS clean, mongo-sanitize) means inputs are clean by the time
// they reach this handler.
router.post('/register', async (req, res, next) => {
  try {
    const registrationEnabled = req.platformSettings?.['registration.enabled'] !== false;
    const invitationOnly = req.platformSettings?.['registration.invitationOnly'] === true;
    if (!registrationEnabled || invitationOnly) {
      return res.status(403).json({ code: 'REGISTRATION_CLOSED', message: invitationOnly ? 'Registration is currently invitation only' : 'Registration is currently closed' });
    }
    const { firstName, lastName, username, email, password, phone } = req.body;
    const tenant = await resolveTenantFromRequest(req);
    const tenantId = tenant?._id || null;
    const normalizedEmail = String(email || '').toLowerCase().trim();

    const pwCheck = validatePasswordStrength(password, req.platformSettings);
    if (!pwCheck.valid) {
      return res.status(400).json({ message: 'Password is too weak', errors: pwCheck.errors });
    }

    const exists = await User.findOne({ tenantId, $or: [{ email: normalizedEmail }, { username }] });
    if (exists) {
      return res.status(400).json({
        message: exists.email === normalizedEmail ? 'Email already registered' : 'Username already taken',
      });
    }

    const user = await User.create({ tenantId, firstName, lastName, username, email: normalizedEmail, password, phone });

    const newUserCoupon = await Coupon.findOne({
      tenantId,
      isNewUserOnly: true,
      isActive:      true,
      validUntil:    { $gte: new Date() },
    });

    await Notification.create({
      tenantId,
      type:    'new_user',
      title:   'New Customer Registered',
      message: `${firstName} ${lastName} just created an account`,
      link:    '/admin/customers',
    });

    const token = await issueSession(user, req, 'registration');

    res.status(201).json({
      token,
      user: { id: user._id, firstName, lastName, username, email, role: user.role },
      newUserCoupon: newUserCoupon
        ? { code: newUserCoupon.code, value: newUserCoupon.value, type: newUserCoupon.type, description: newUserCoupon.description }
        : null,
    });
  } catch (err) {
    // SECURITY: Pass to global errorHandler instead of leaking err.message directly.
    next(err);
  }
});

// ─── Login ────────────────────────────────────────────────────────────────────
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const tenant = await resolveTenantFromRequest(req);
    const tenantId = tenant?._id || null;
    const normalizedEmail = String(email || '').toLowerCase().trim();

    // SECURITY: Find user; if not found, run a dummy bcrypt compare to make
    //           timing indistinguishable from a wrong-password scenario.
    // Superadmin users have tenantId=null, so they won't be found when a
    // tenant domain is resolved (e.g. localhost -> Demo Store). Always
    // also check for superadmin matching by email without tenant filter.
    let user = await User.findOne({ tenantId, email: normalizedEmail }).select('+tokenVersion');
    if (!user) {
      user = await User.findOne({ tenantId: null, email: normalizedEmail, role: 'superadmin' }).select('+tokenVersion');
    }

    if (!user) {
      // SECURITY: Timing-safe — always do a bcrypt comparison so response time
      //           is the same whether the email exists or not.
      await bcrypt.compare(password || '', DUMMY_HASH).catch(() => {});
      recordAuthEvent(req, { email: normalizedEmail, eventType: 'login', outcome: 'failure', reason: 'invalid_credentials', authMethod: 'password' }).catch(() => {});
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // SECURITY: Check account lockout BEFORE the password comparison.
    //           Locked accounts get a generic 429 to signal they should wait.
    if (isAccountLocked(user)) {
      const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
      recordAuthEvent(req, { user, eventType: 'login', outcome: 'blocked', reason: 'account_locked', authMethod: 'password' }).catch(() => {});
      return res.status(429).json({
        message: `Account temporarily locked. Please try again in ${minutesLeft} minute(s).`,
      });
    }

    const passwordMatch = await user.comparePassword(password);

    if (!passwordMatch) {
      // SECURITY: Increment failed-login counter; this may lock the account.
      await recordFailedLogin(user);
      recordAuthEvent(req, { user, eventType: user.loginAttempts >= 5 ? 'account_locked' : 'login', outcome: 'failure', reason: 'invalid_credentials', authMethod: 'password' }).catch(() => {});
      // SECURITY: Identical message whether the email or the password is wrong
      //           to prevent user enumeration.
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // SECURITY: Reset lockout counters on successful authentication.
    await clearFailedLogin(user);

    if (!user.isActive) {
      return res.status(403).json({ message: 'Your account has been deactivated' });
    }

    user.lastLogin = Date.now();
    await user.save();

    const mfaFactor = user.role === 'superadmin' ? await getFactor(user._id) : null;
    if (user.role === 'superadmin' && req.platformSettings?.['security.mfaPolicy'] === 'platform_required' && !mfaFactor?.enabled && !user.mfaEnrollmentRequired) {
      user.mfaEnrollmentRequired = true;
      await user.save();
    }
    if (mfaFactor?.enabled) {
      return res.json({ mfaRequired: true, challengeToken: createChallengeToken(user, 'password'), user: { id: user._id, email: user.email, role: user.role } });
    }
    const token = await issueSession(user, req, 'password');

    res.json({
      token,
      user: {
        id:        user._id,
        firstName: user.firstName,
        lastName:  user.lastName,
        username:  user.username,
        email:     user.email,
        role:      user.role,
        tenantId:   user.tenantId,
        avatar:    user.avatar,
        mfaEnrollmentRequired: user.mfaEnrollmentRequired === true,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── Google OAuth ─────────────────────────────────────────────────────────────
router.get('/superadmin/google-config', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!GOOGLE_SUPERADMIN_CLIENT_ID) return res.status(503).json({ enabled: false, message: 'Super admin Google Sign-In is not configured' });
  res.json({ enabled: true, clientId: GOOGLE_SUPERADMIN_CLIENT_ID });
});

router.post('/superadmin/google', async (req, res) => {
  try {
    const credential = String(req.body?.credential || '');
    if (!credential || !GOOGLE_SUPERADMIN_CLIENT_ID) return res.status(400).json({ message: 'Google credential is required' });
    const ticket = await superAdminGoogleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_SUPERADMIN_CLIENT_ID });
    const payload = ticket.getPayload() || {};
    const email = String(payload.email || '').trim().toLowerCase();
    if (!payload.email_verified || !email) return res.status(403).json({ message: 'Google identity is not verified' });
    if (SUPERADMIN_GOOGLE_EMAILS.size && !SUPERADMIN_GOOGLE_EMAILS.has(email)) {
      return res.status(403).json({ message: 'This Google account is not authorized for platform management' });
    }
    const user = await User.findOne({ email, role: 'superadmin', tenantId: null }).select('+tokenVersion');
    if (!user || !user.isActive) return res.status(403).json({ message: 'This Google account is not authorized for platform management' });
    if (user.googleId && user.googleId !== payload.sub) return res.status(403).json({ message: 'Google identity does not match the enrolled account' });
    user.googleId = payload.sub;
    if (!user.avatar && payload.picture) user.avatar = payload.picture;
    user.isVerified = true;
    user.lastLogin = new Date();
    await user.save();
    const mfaFactor = await getFactor(user._id);
    if (req.platformSettings?.['security.mfaPolicy'] === 'platform_required' && !mfaFactor?.enabled && !user.mfaEnrollmentRequired) {
      user.mfaEnrollmentRequired = true;
      await user.save();
    }
    if (mfaFactor?.enabled) return res.json({ mfaRequired: true, challengeToken: createChallengeToken(user, 'google'), user: { id: user._id, email: user.email, role: user.role } });
    const token = await issueSession(user, req, 'google');
    res.json({ token, user: { id: user._id, firstName: user.firstName, lastName: user.lastName, username: user.username, email: user.email, role: user.role, tenantId: null, avatar: user.avatar, mfaEnrollmentRequired: user.mfaEnrollmentRequired === true } });
  } catch (error) {
    console.error('[SUPERADMIN GOOGLE AUTH]', error.message);
    recordAuthEvent(req, { email: '', eventType: 'login', outcome: 'failure', reason: 'google_verification_failed', authMethod: 'google' }).catch(() => {});
    res.status(401).json({ message: 'Secure Google sign-in failed' });
  }
});

// All tenant domains use one permanent, Google-authorized frontend origin.
// This avoids adding every new store/custom domain to Google Cloud manually.
router.get('/google/config', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const bridgeUrl = getGoogleBridgeUrl();
  if (!GOOGLE_LOGIN_CLIENT_ID || !bridgeUrl) {
    return res.status(503).json({
      enabled: false,
      message: 'Google Sign-In platform configuration is incomplete.',
    });
  }
  return res.json({ enabled: true, bridgeUrl });
});

// Called only by the fixed bridge page. It releases the public OAuth client ID
// after confirming that the requesting storefront is a mapped active tenant.
router.get('/google/bridge-config', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!GOOGLE_LOGIN_CLIENT_ID) {
    return res.status(503).json({ message: 'Google Sign-In is not configured.' });
  }

  const returnOrigin = parseWebOrigin(req.query.returnOrigin);
  const store = returnOrigin ? await getGoogleReturnStore(returnOrigin) : null;
  if (!returnOrigin || !store) {
    return res.status(403).json({ message: 'This storefront is not authorized for Google Sign-In.' });
  }

  return res.json({ clientId: GOOGLE_LOGIN_CLIENT_ID, returnOrigin, store });
});

router.post('/google', async (req, res, next) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ message: 'Google credential is required' });
    if (!GOOGLE_LOGIN_CLIENT_ID) return res.status(503).json({ message: 'Google Sign-In is not configured' });
    const tenant = await resolveTenantFromRequest(req);
    const tenantId = tenant?._id || null;

    const ticket = await googleClient.verifyIdToken({
      idToken:  credential,
      audience: GOOGLE_LOGIN_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { email, given_name, family_name, picture, sub: googleId } = payload;
    const normalizedEmail = String(email || '').toLowerCase().trim();

    let user = await User.findOne(tenantId ? { tenantId, googleId } : { googleId });
    if (!user) user = await User.findOne(tenantId ? { tenantId, email: normalizedEmail } : { email: normalizedEmail });
    if (!user && tenantId) {
      const legacyUser = await User.findOne({ tenantId: null, email: normalizedEmail, role: 'customer' });
      if (legacyUser) user = await attachLegacyCustomerToTenant(legacyUser, tenantId);
    }

    if (!user) {
      const username = await makeUniqueUsername(normalizedEmail.split('@')[0], tenantId);

      user = await User.create({
        tenantId,
        firstName:  given_name  || 'User',
        lastName:   family_name || '',
        username,
        email:      normalizedEmail,
        password:   crypto.randomBytes(32).toString('hex'),
        googleId,
        avatar:     picture || '',
        isVerified: true,
      });

      await Notification.create({
        tenantId,
        type:    'new_user',
        title:   'New Customer (Google)',
        message: `${given_name || normalizedEmail} signed up via Google`,
        link:    '/admin/customers',
      });
    }

    if (!user.isActive) return res.status(403).json({ message: 'Your account has been deactivated' });

    let dirty = false;
    if (!user.googleId)          { user.googleId = googleId; dirty = true; }
    if (!user.avatar && picture) { user.avatar   = picture;  dirty = true; }
    if (tenantId && !user.tenantId && user.role === 'customer') { user.tenantId = tenantId; dirty = true; }
    user.lastLogin = Date.now();
    if (dirty) await user.save();
    else await User.findByIdAndUpdate(user._id, { lastLogin: Date.now() });

    const token = await issueSession(user, req, 'google');

    res.json({
      token,
      user: {
        id:        user._id,
        firstName: user.firstName,
        lastName:  user.lastName,
        username:  user.username,
        email:     user.email,
        role:      user.role,
        tenantId:   user.tenantId,
        avatar:    user.avatar,
      },
    });
  } catch (err) {
    // SECURITY: Log the internal error but return a generic message so Google
    //           API internals are not disclosed.
    console.error('[GOOGLE AUTH ERROR]', err.message);
    recordAuthEvent(req, { email: '', eventType: 'login', outcome: 'failure', reason: 'google_verification_failed', authMethod: 'google' }).catch(() => {});
    res.status(500).json({ message: 'Google sign-in failed' });
  }
});

// ─── Forgot Password — Send OTP ───────────────────────────────────────────────
// UNCHANGED behaviour.
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({ message: 'Email address is required' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const tenant = await resolveTenantFromRequest(req);
    let user = await User.findOne(tenant
      ? { tenantId: tenant._id, email: normalizedEmail }
      : { email: normalizedEmail });
    if (!user && tenant) {
      const legacyUser = await User.findOne({ tenantId: null, email: normalizedEmail, role: 'customer' });
      if (legacyUser) user = await attachLegacyCustomerToTenant(legacyUser, tenant._id);
    }
    if (!user) {
      return res.status(404).json({ message: 'No account found with this email address' });
    }

    const otp       = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    const otpFilter = { email: user.email, tenantId: user.tenantId || null };
    await OTP.deleteMany(otpFilter);
    await OTP.create({ ...otpFilter, otp, expiresAt });

    try {
      await sendMail({
        to:      user.email,
        subject: `${otp} — Your StoreKit Password Reset OTP`,
        html:    await otpEmailHtml(otp, user.firstName, { tenantId: user.tenantId, tenant }),
        tenantId: user.tenantId,
        tenant,
      });
    } catch (mailErr) {
      console.error('[FORGOT-PASSWORD] SMTP error:', mailErr.message);
      await OTP.deleteMany(otpFilter).catch(() => {});
      return res.status(500).json({
        message:
          'Unable to send the OTP email right now. ' +
          'Please check your spam folder or try again in a few minutes. ' +
          'If this keeps happening, contact support.',
      });
    }

    res.json({ message: 'OTP sent to your email address. Please check your inbox (and spam folder).' });
  } catch (err) {
    next(err);
  }
});

// ─── Verify OTP ───────────────────────────────────────────────────────────────
// UNCHANGED behaviour.
router.post('/verify-otp', async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    const normalizedEmail = String(email || '').toLowerCase().trim();
    const tenant = await resolveTenantFromRequest(req);
    const tenantId = tenant?._id || null;
    const record = await OTP.findOne({ email: normalizedEmail, tenantId, otp, used: false, expiresAt: { $gte: new Date() } });
    if (!record) {
      return res.status(400).json({ message: 'Invalid or expired OTP. Please request a new one.' });
    }
    const resetToken = crypto.randomBytes(32).toString('hex');
    record.used = true;
    await record.save();
    await OTP.create({ email: normalizedEmail, tenantId, otp: resetToken, expiresAt: new Date(Date.now() + 15 * 60 * 1000) });
    res.json({ message: 'OTP verified', resetToken });
  } catch (err) {
    next(err);
  }
});

// ─── Reset Password ───────────────────────────────────────────────────────────
// UNCHANGED behaviour.
router.post('/reset-password', async (req, res, next) => {
  try {
    const { email, resetToken, newPassword } = req.body;
    const normalizedEmail = String(email || '').toLowerCase().trim();
    const tenant = await resolveTenantFromRequest(req);
    const tenantId = tenant?._id || null;

    const pwCheck = validatePasswordStrength(newPassword, req.platformSettings);
    if (!pwCheck.valid) {
      return res.status(400).json({ message: 'Password is too weak', errors: pwCheck.errors });
    }

    const record = await OTP.findOne({ email: normalizedEmail, tenantId, otp: resetToken, used: false, expiresAt: { $gte: new Date() } });
    if (!record) {
      return res.status(400).json({ message: 'Invalid or expired reset token. Please restart the password reset process.' });
    }

    const user = await User.findOne(tenantId ? { tenantId, email: normalizedEmail } : { email: normalizedEmail }).select('+tokenVersion');
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.password  = newPassword;
    user.lastLogin = Date.now();
    user.tokenVersion = Number(user.tokenVersion || 0) + 1;
    await user.save();

    await revokeAllUserSessions(user._id, user._id, 'Password reset');

    record.used = true;
    await record.save();

    // SECURITY: Also clear any lockout from repeated bad-password attempts.
    await clearFailedLogin(user);

    const mfaFactor = user.role === 'superadmin' ? await getFactor(user._id) : null;
    if (mfaFactor?.enabled) return res.json({ message: 'Password reset successfully', mfaRequired: true, challengeToken: createChallengeToken(user, 'password_reset'), user: { id: user._id, email: user.email, role: user.role } });
    const token = await issueSession(user, req, 'password_reset');

    res.json({
      message: 'Password reset successfully',
      token,
      user: {
        id:        user._id,
        firstName: user.firstName,
        lastName:  user.lastName,
        username:  user.username,
        email:     user.email,
        role:      user.role,
        tenantId:   user.tenantId,
        avatar:    user.avatar,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── Get profile ──────────────────────────────────────────────────────────────
router.get('/me', auth, async (req, res) => { res.json(req.user); });

// ─── Multi-factor authentication ─────────────────────────────────────────────
router.get('/mfa/status', auth, async (req, res, next) => {
  try {
    const factor = await getFactor(req.user._id);
    res.json({ enrolled: Boolean(factor), enabled: factor?.enabled === true, enrolledAt: factor?.enrolledAt || null, lastUsedAt: factor?.lastUsedAt || null });
  } catch (error) { next(error); }
});

router.post('/mfa/setup', auth, async (req, res, next) => {
  try {
    if (req.user.role !== 'superadmin') return res.status(403).json({ message: 'Platform MFA enrollment is currently limited to Super Admin operators' });
    const enrollment = await createEnrollment(req.user);
    res.json(enrollment);
  } catch (error) { next(error); }
});

router.post('/mfa/confirm', auth, async (req, res, next) => {
  try {
    const verification = await verifyFactor(req.user._id, req.body?.code, { allowRecovery: false });
    if (!verification.valid) return res.status(400).json({ message: 'Invalid authenticator code' });
    verification.factor.enabled = true; verification.factor.enrolledAt = new Date(); await verification.factor.save();
    await User.updateOne({ _id: req.user._id }, { $set: { mfaEnrollmentRequired: false } });
    if (req.authSessionId) await AuthSession.updateOne({ sessionId: req.authSessionId }, { $set: { mfaVerifiedAt: new Date(), lastStepUpAt: new Date() } });
    res.json({ message: 'Multi-factor authentication enabled' });
  } catch (error) { next(error); }
});

router.post('/mfa/challenge', async (req, res) => {
  try {
    const payload = verifyChallengeToken(String(req.body?.challengeToken || ''));
    const user = await User.findById(payload.id).select('+tokenVersion');
    if (!user || !user.isActive || Number(user.tokenVersion || 0) !== Number(payload.ver || 0)) return res.status(401).json({ message: 'MFA challenge expired or invalid' });
    const verification = await verifyFactor(user._id, req.body?.code);
    if (!verification.valid) { await recordAuthEvent(req, { user, eventType: 'login', outcome: 'failure', reason: 'invalid_mfa', authMethod: payload.method }); return res.status(401).json({ message: 'Invalid authenticator or recovery code' }); }
    const token = await issueSession(user, req, payload.method, { mfaVerified: true });
    if (user.mfaEnrollmentRequired) { user.mfaEnrollmentRequired = false; await user.save(); }
    res.json({ token, recoveryCodeUsed: verification.method === 'recovery', remainingRecoveryCodes: verification.remainingRecoveryCodes, user: { id: user._id, firstName: user.firstName, lastName: user.lastName, username: user.username, email: user.email, role: user.role, tenantId: user.tenantId, avatar: user.avatar, mfaEnrollmentRequired: false } });
  } catch (error) { res.status(401).json({ message: 'MFA challenge expired or invalid' }); }
});

router.post('/mfa/step-up', auth, async (req, res, next) => {
  try {
    if (!req.authSessionId) return res.status(400).json({ message: 'Sign in again before completing step-up authentication' });
    const verification = await verifyFactor(req.user._id, req.body?.code);
    if (!verification.valid) return res.status(401).json({ message: 'Invalid authenticator or recovery code' });
    await AuthSession.updateOne({ sessionId: req.authSessionId, userId: req.user._id }, { $set: { mfaVerifiedAt: new Date(), lastStepUpAt: new Date() } });
    res.json({ message: 'Step-up authentication complete', validForSeconds: 600, recoveryCodeUsed: verification.method === 'recovery' });
  } catch (error) { next(error); }
});

router.delete('/mfa', auth, async (req, res, next) => {
  try {
    const verification = await verifyFactor(req.user._id, req.body?.code);
    if (!verification.valid) return res.status(401).json({ message: 'Invalid authenticator or recovery code' });
    await MfaFactor.deleteOne({ userId: req.user._id });
    await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
    await revokeAllUserSessions(req.user._id, req.user._id, 'MFA disabled');
    res.json({ message: 'Multi-factor authentication disabled. Sign in again.' });
  } catch (error) { next(error); }
});

// ─── Update profile ───────────────────────────────────────────────────────────
router.put('/profile', auth, async (req, res, next) => {
  try {
    const { firstName, lastName, phone, addresses, defaultAddress } = req.body;
    const update = {};
    if (firstName !== undefined) update.firstName = firstName;
    if (lastName  !== undefined) update.lastName  = lastName;
    if (phone     !== undefined) update.phone     = phone;

    if (defaultAddress) {
      const user = await User.findById(req.user._id);
      const addr = {
        label:     'Default',
        country:   defaultAddress.country || '',
        street:    defaultAddress.street  || '',
        city:      defaultAddress.city    || '',
        isDefault: true,
      };
      const idx = user.addresses.findIndex(a => a.isDefault);
      if (idx > -1) { user.addresses[idx] = addr; } else { user.addresses.push(addr); }
      const defaultIdx = idx > -1 ? idx : user.addresses.length - 1;
      user.addresses.forEach((a, i) => { if (i !== defaultIdx) a.isDefault = false; });
      update.addresses = user.addresses;
    } else if (addresses !== undefined) {
      update.addresses = addresses;
    }

    const updated = await User.findByIdAndUpdate(req.user._id, update, { new: true }).select('-password');
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ─── Change password ──────────────────────────────────────────────────────────
router.put('/change-password', auth, async (req, res, next) => {
  try {
    const { newPassword } = req.body;

    const pwCheck = validatePasswordStrength(newPassword, req.platformSettings);
    if (!pwCheck.valid) {
      return res.status(400).json({ message: 'Password is too weak', errors: pwCheck.errors });
    }

    const user    = await User.findById(req.user._id);
    user.password = newPassword;
    await user.save();
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    next(err);
  }
});

// ─── Get wishlist ─────────────────────────────────────────────────────────────
router.get('/wishlist', auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).populate('wishlist');
    res.json(user.wishlist);
  } catch (err) {
    next(err);
  }
});

// ─── Toggle wishlist ──────────────────────────────────────────────────────────
router.post('/wishlist/:productId', auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    const idx  = user.wishlist.indexOf(req.params.productId);
    if (idx > -1) user.wishlist.splice(idx, 1);
    else           user.wishlist.push(req.params.productId);
    await user.save();
    res.json({ wishlist: user.wishlist });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
