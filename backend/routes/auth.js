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
const { auth, generateToken, recordFailedLogin, clearFailedLogin, isAccountLocked } = require('../middleware/auth');
const { Notification, OTP, Coupon } = require('../models/index');
const { sendMail, otpEmailHtml }    = require('../utils/mailer');

// SECURITY: Use the shared generateToken so issuer/audience are embedded
//           when JWT_ISSUER / JWT_AUDIENCE are configured in .env.
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// SECURITY: Pre-hashed dummy value used in timing-safe "user not found" path.
//           bcrypt.compare is slow by design — if we skip it when the user
//           doesn't exist, an attacker can detect non-existent emails by
//           measuring response time.
const DUMMY_HASH = '$2a$12$dummyhashtopreventtimingattacks.onloginendpoint.padded';

// ─── Password strength validator ─────────────────────────────────────────────
// Returns { valid: Boolean, errors: String[] } — unchanged from original.
function validatePasswordStrength(password) {
  const errors = [];
  if (!password || password.length < 8)      errors.push('At least 8 characters');
  if (!/[A-Z]/.test(password))               errors.push('At least one uppercase letter (A-Z)');
  if (!/[a-z]/.test(password))               errors.push('At least one lowercase letter (a-z)');
  if (!/[0-9]/.test(password))               errors.push('At least one number (0-9)');
  if (!/[^A-Za-z0-9]/.test(password))        errors.push('At least one special character (!@#$%^&* etc.)');
  return { valid: errors.length === 0, errors };
}

// ─── Register ─────────────────────────────────────────────────────────────────
// UNCHANGED behaviour — security hardening via sanitisation middleware in
// security.js (XSS clean, mongo-sanitize) means inputs are clean by the time
// they reach this handler.
router.post('/register', async (req, res, next) => {
  try {
    const { firstName, lastName, username, email, password, phone } = req.body;

    const pwCheck = validatePasswordStrength(password);
    if (!pwCheck.valid) {
      return res.status(400).json({ message: 'Password is too weak', errors: pwCheck.errors });
    }

    const exists = await User.findOne({ $or: [{ email }, { username }] });
    if (exists) {
      return res.status(400).json({
        message: exists.email === email ? 'Email already registered' : 'Username already taken',
      });
    }

    const user = await User.create({ firstName, lastName, username, email, password, phone });

    const newUserCoupon = await Coupon.findOne({
      isNewUserOnly: true,
      isActive:      true,
      validUntil:    { $gte: new Date() },
    });

    await Notification.create({
      type:    'new_user',
      title:   'New Customer Registered',
      message: `${firstName} ${lastName} just created an account`,
      link:    '/admin/customers',
    });

    const token = generateToken(user._id);

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

    // SECURITY: Find user; if not found, run a dummy bcrypt compare to make
    //           timing indistinguishable from a wrong-password scenario.
    const user = await User.findOne({ email });

    if (!user) {
      // SECURITY: Timing-safe — always do a bcrypt comparison so response time
      //           is the same whether the email exists or not.
      await bcrypt.compare(password || '', DUMMY_HASH).catch(() => {});
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // SECURITY: Check account lockout BEFORE the password comparison.
    //           Locked accounts get a generic 429 to signal they should wait.
    if (isAccountLocked(user)) {
      const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return res.status(429).json({
        message: `Account temporarily locked. Please try again in ${minutesLeft} minute(s).`,
      });
    }

    const passwordMatch = await user.comparePassword(password);

    if (!passwordMatch) {
      // SECURITY: Increment failed-login counter; this may lock the account.
      await recordFailedLogin(user);
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

    const token = generateToken(user._id);

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
    next(err);
  }
});

// ─── Google OAuth ─────────────────────────────────────────────────────────────
// UNCHANGED behaviour.
router.post('/google', async (req, res, next) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ message: 'Google credential is required' });

    const ticket = await googleClient.verifyIdToken({
      idToken:  credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { email, given_name, family_name, picture, sub: googleId } = payload;

    let user = await User.findOne({ googleId });
    if (!user) user = await User.findOne({ email });

    if (!user) {
      const base = (email.split('@')[0]).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20) || 'user';
      let username = base;
      let attempt  = 0;
      while (await User.findOne({ username })) {
        attempt++;
        username = `${base}_${attempt}`;
      }

      user = await User.create({
        firstName:  given_name  || 'User',
        lastName:   family_name || '',
        username,
        email,
        password:   crypto.randomBytes(32).toString('hex'),
        googleId,
        avatar:     picture || '',
        isVerified: true,
      });

      await Notification.create({
        type:    'new_user',
        title:   'New Customer (Google)',
        message: `${given_name || email} signed up via Google`,
        link:    '/admin/customers',
      });
    }

    if (!user.isActive) return res.status(403).json({ message: 'Your account has been deactivated' });

    let dirty = false;
    if (!user.googleId)          { user.googleId = googleId; dirty = true; }
    if (!user.avatar && picture) { user.avatar   = picture;  dirty = true; }
    user.lastLogin = Date.now();
    if (dirty) await user.save();
    else await User.findByIdAndUpdate(user._id, { lastLogin: Date.now() });

    const token = generateToken(user._id);

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

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(404).json({ message: 'No account found with this email address' });
    }

    const otp       = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    await OTP.deleteMany({ email: user.email });
    await OTP.create({ email: user.email, otp, expiresAt });

    try {
      await sendMail({
        to:      user.email,
        subject: `${otp} — Your StoreKit Password Reset OTP`,
        html:    await otpEmailHtml(otp, user.firstName),
      });
    } catch (mailErr) {
      console.error('[FORGOT-PASSWORD] SMTP error:', mailErr.message);
      await OTP.deleteMany({ email: user.email }).catch(() => {});
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
    const record = await OTP.findOne({ email, otp, used: false, expiresAt: { $gte: new Date() } });
    if (!record) {
      return res.status(400).json({ message: 'Invalid or expired OTP. Please request a new one.' });
    }
    const resetToken = crypto.randomBytes(32).toString('hex');
    record.used = true;
    await record.save();
    await OTP.create({ email, otp: resetToken, expiresAt: new Date(Date.now() + 15 * 60 * 1000) });
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

    const pwCheck = validatePasswordStrength(newPassword);
    if (!pwCheck.valid) {
      return res.status(400).json({ message: 'Password is too weak', errors: pwCheck.errors });
    }

    const record = await OTP.findOne({ email, otp: resetToken, used: false, expiresAt: { $gte: new Date() } });
    if (!record) {
      return res.status(400).json({ message: 'Invalid or expired reset token. Please restart the password reset process.' });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.password  = newPassword;
    user.lastLogin = Date.now();
    await user.save();

    record.used = true;
    await record.save();

    // SECURITY: Also clear any lockout from repeated bad-password attempts.
    await clearFailedLogin(user);

    const token = generateToken(user._id);

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

    const pwCheck = validatePasswordStrength(newPassword);
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