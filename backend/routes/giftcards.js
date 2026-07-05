const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { GiftCard, Notification } = require('../models/index');
const { auth, adminAuth } = require('../middleware/auth');
const {
  sendMail,
  getAdminEmail,
  getTheme,
  wrapper,
  header,
  footer,
  lighten,
  isEmailEnabled,
} = require('../utils/mailer');

// ── Code generator ─────────────────────────────────────────────────────────────
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const generateCode = () => {
  let code = 'GC';
  for (let i = 0; i < 4; i++) {
    code += '-';
    for (let j = 0; j < 4; j++) code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return code;
};
const ensureUniqueCode = async () => {
  let code, exists = true;
  while (exists) { code = generateCode(); exists = await GiftCard.findOne({ code }); }
  return code;
};

// ── Slip storage (local disk, same pattern as orders) ─────────────────────────
let uploadSlip;
try {
  const { v2: cloudinary } = require('cloudinary');
  const { CloudinaryStorage } = require('multer-storage-cloudinary');
  if (process.env.CLOUDINARY_CLOUD_NAME) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
    const slipStorage = new CloudinaryStorage({
      cloudinary,
      params: (req, file) => ({
        folder: 'storekit/gift-card-slips',
        allowed_formats: ['jpg', 'jpeg', 'png', 'pdf', 'webp'],
        public_id: `gc-slip-${req.params.id}-${Date.now()}`,
        // PDFs must use resource_type 'raw' so Cloudinary serves them via
        // /raw/upload/ (publicly accessible). 'auto' causes PDFs to land
        // under /image/upload/ which returns 401 for raw files.
        resource_type: file.mimetype === 'application/pdf' ? 'raw' : 'image',
        type: 'upload', // ensures public (not authenticated) delivery
      }),
    });
    uploadSlip = multer({ storage: slipStorage, limits: { fileSize: 8 * 1024 * 1024 } });
    console.log('🌥️  Gift-card slip storage: Cloudinary');
  } else throw new Error('no cloudinary config');
} catch (_) {
  const slipStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(__dirname, '../uploads/gift-card-slips');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `gc-slip-${req.params.id}-${Date.now()}${ext}`);
    },
  });
  uploadSlip = multer({ storage: slipStorage, limits: { fileSize: 8 * 1024 * 1024 } });
  console.log('💾 Gift-card slip storage: local disk');
}

const absoluteSlipUrl = (rel) => {
  if (!rel) return null;
  if (rel.startsWith('http')) return rel;
  // Resolve base URL: BACKEND_URL (may omit protocol) → RAILWAY_STATIC_URL → localhost fallback
  let base =
    process.env.BACKEND_URL ||
    process.env.RAILWAY_STATIC_URL ||
    `http://localhost:${process.env.PORT || 5001}`;
  // Ensure protocol is present (BACKEND_URL in .env often omits https://)
  if (base && !base.startsWith('http://') && !base.startsWith('https://')) {
    base = 'https://' + base;
  }
  return `${base.replace(/\/$/, '')}${rel}`;
};

// ── Email helpers for gift cards ───────────────────────────────────────────────

// Helper: get theme from mailer (re-export pattern)
const getT = async () => {
  try {
    const { Settings } = require('../models/index');
    const rows = await Settings.find({ key: { $in: ['primaryColor', 'storeName', 'storeUrl'] } }, 'key value').lean();
    const map = {};
    rows.forEach(r => { map[r.key] = r.value; });
    return {
      primary: map.primaryColor || '#15803d',
      storeName: map.storeName || 'StoreKit',
      storeUrl: map.storeUrl || process.env.FRONTEND_URL || 'https://storekit.local',
    };
  } catch {
    return { primary: '#15803d', storeName: 'StoreKit', storeUrl: process.env.FRONTEND_URL || 'https://storekit.local' };
  }
};

const lx = (hex) => {
  try {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const mix = (c) => Math.min(255, Math.round(c + (255 - c) * 0.35));
    return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
  } catch { return '#22c55e'; }
};

const wrapEmail = (content, t) => `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f1f5f9;padding:40px 20px;margin:0">
  <div style="max-width:560px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.09)">
    ${content}
    <div style="background:#f8fafc;padding:16px;text-align:center;border-top:1px solid #e5e7eb">
      <p style="color:#9ca3af;font-size:12px;margin:0;font-family:sans-serif">© ${new Date().getFullYear()} ${t.storeName} · <a href="${t.storeUrl}" style="color:${t.primary};text-decoration:none">${t.storeUrl}</a></p>
    </div>
  </div></body></html>`;

const gcHeader = (subtitle, t) => `
  <div style="background:linear-gradient(135deg,${t.primary},${lx(t.primary)});padding:32px;text-align:center">
    <div style="font-size:40px;margin-bottom:8px">🎁</div>
    <h1 style="color:white;margin:0;font-size:26px;font-family:sans-serif">${t.storeName}</h1>
    <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:14px;font-family:sans-serif">${subtitle}</p>
  </div>`;

const DESIGN_EMOJIS = { default: '🎁', birthday: '🎂', christmas: '🎄', anniversary: '💝', thankyou: '💙' };
const DESIGN_LABELS = { default: 'Classic Gift', birthday: 'Birthday', christmas: 'Christmas', anniversary: 'Anniversary', thankyou: 'Thank You' };

// 1. Admin: new gift card purchase notification
const gcNewPurchaseAdminHtml = async (card) => {
  const t = await getT();
  return wrapEmail(`
    ${gcHeader('🎁 New Gift Card Purchase', t)}
    <div style="padding:32px">
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:16px;margin-bottom:20px;text-align:center">
        <p style="margin:0 0 4px;font-size:12px;color:#166534">New Gift Card Order</p>
        <p style="margin:0;font-size:22px;font-weight:800;color:#15803d;font-family:monospace">${card.code}</p>
        <p style="margin:8px 0 0;font-size:20px;font-weight:700;color:#166534">Rs. ${card.initialValue?.toLocaleString()}</p>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;width:40%">Purchaser</td><td style="padding:8px 0;font-size:13px;font-weight:600;color:#111">${card.purchaserName}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Purchaser Email</td><td style="padding:8px 0;font-size:13px;color:#111">${card.purchaserEmail}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Recipient</td><td style="padding:8px 0;font-size:13px;color:#111">${card.recipientName || '—'}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Recipient Email</td><td style="padding:8px 0;font-size:13px;color:#111">${card.recipientEmail || '—'}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Design</td><td style="padding:8px 0;font-size:13px;color:#111">${DESIGN_EMOJIS[card.design] || '🎁'} ${DESIGN_LABELS[card.design] || card.design}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Payment</td><td style="padding:8px 0;font-size:13px;color:#111">🏦 Bank Transfer</td></tr>
        ${card.message ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Message</td><td style="padding:8px 0;font-size:13px;color:#374151;font-style:italic">"${card.message}"</td></tr>` : ''}
      </table>
      <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;padding:14px;margin-bottom:20px">
        <p style="margin:0;font-size:13px;color:#92400e;font-weight:600">⏳ Awaiting Payment Slip</p>
        <p style="margin:6px 0 0;font-size:13px;color:#92400e">The customer needs to upload a bank transfer slip. Once uploaded, you will receive another notification to review and approve.</p>
      </div>
      <a href="${t.storeUrl}/admin/gift-cards"
         style="display:inline-block;background:linear-gradient(135deg,${t.primary},${lx(t.primary)});color:white;padding:12px 24px;border-radius:10px;font-weight:700;font-size:14px;text-decoration:none">
        View Gift Cards Dashboard →
      </a>
    </div>`, t);
};

// 2. Customer: purchase confirmation (pending payment)
const gcPurchaseCustomerHtml = async (card) => {
  const t = await getT();
  return wrapEmail(`
    ${gcHeader('Gift Card Order Placed! 🎉', t)}
    <div style="padding:32px">
      <p style="color:#374151">Hi <strong>${card.purchaserName}</strong>,</p>
      <p style="color:#6b7280;font-size:14px;margin-bottom:20px">Your gift card order has been placed. To activate it, please complete the bank transfer and upload your payment slip in <strong>My Orders</strong>.</p>
      <div style="background:#f8fafc;border-radius:10px;padding:16px;text-align:center;margin-bottom:20px">
        <p style="margin:0 0 4px;font-size:12px;color:#6b7280">Gift Card Reference</p>
        <p style="margin:0;font-size:22px;font-weight:800;color:${t.primary};font-family:monospace">${card.code}</p>
        <p style="margin:8px 0 0;font-size:18px;font-weight:700;color:#374151">Rs. ${card.initialValue?.toLocaleString()}</p>
      </div>
      <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;padding:16px;margin-bottom:20px">
        <p style="margin:0 0 6px;font-weight:700;color:#92400e;font-size:14px">⚠️ Action Required — Bank Transfer</p>
        <p style="margin:0;color:#92400e;font-size:13px;line-height:1.6">
          Please transfer <strong>Rs. ${card.initialValue?.toLocaleString()}</strong> to the store bank account and upload your payment slip in My Orders.<br><br>
          Use <strong>${card.code}</strong> as the payment reference.
        </p>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;width:40%">For</td><td style="padding:8px 0;font-size:13px;color:#111">${card.recipientName || card.recipientEmail || 'Self'}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Design</td><td style="padding:8px 0;font-size:13px;color:#111">${DESIGN_EMOJIS[card.design] || '🎁'} ${DESIGN_LABELS[card.design] || card.design}</td></tr>
        ${card.message ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Your message</td><td style="padding:8px 0;font-size:13px;color:#374151;font-style:italic">"${card.message}"</td></tr>` : ''}
      </table>
      <a href="${t.storeUrl}/my-orders"
         style="display:inline-block;background:linear-gradient(135deg,${t.primary},${lx(t.primary)});color:white;padding:12px 24px;border-radius:10px;font-weight:700;font-size:14px;text-decoration:none">
        Upload Payment Slip →
      </a>
      <p style="margin-top:16px;color:#9ca3af;font-size:12px">Once your payment is verified, the gift card will be activated and the recipient will receive an email notification.</p>
    </div>`, t);
};

// 3. Admin: slip uploaded for gift card
const gcSlipUploadedAdminHtml = async (card, slipUrl) => {
  const t = await getT();
  return wrapEmail(`
    ${gcHeader('📎 Gift Card Payment Slip Uploaded', t)}
    <div style="padding:32px">
      <p style="color:#374151;margin:0 0 16px">A customer has uploaded a payment slip for a gift card purchase.</p>
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:16px;margin-bottom:20px;text-align:center">
        <p style="margin:0 0 4px;font-size:12px;color:#166534">Gift Card</p>
        <p style="margin:0;font-size:22px;font-weight:800;color:#15803d;font-family:monospace">${card.code}</p>
        <p style="margin:8px 0 0;font-size:18px;font-weight:700;color:#166534">Rs. ${card.initialValue?.toLocaleString()}</p>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;width:40%">Purchaser</td><td style="padding:8px 0;font-size:13px;font-weight:600;color:#111">${card.purchaserName}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Email</td><td style="padding:8px 0;font-size:13px;color:#111">${card.purchaserEmail}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Recipient</td><td style="padding:8px 0;font-size:13px;color:#111">${card.recipientName || '—'} ${card.recipientEmail ? `(${card.recipientEmail})` : ''}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Uploaded At</td><td style="padding:8px 0;font-size:13px;color:#111">${new Date().toLocaleString('en-LK')}</td></tr>
      </table>
      ${slipUrl && /\.(jpg|jpeg|png|gif|webp)$/i.test(slipUrl) ? `
        <p style="font-size:13px;color:#6b7280;margin-bottom:8px">Payment slip preview:</p>
        <img src="${slipUrl}" alt="Payment Slip" style="width:100%;max-height:300px;object-fit:contain;border-radius:10px;border:1px solid #e5e7eb;margin-bottom:16px" />
      ` : slipUrl ? `
        <p style="font-size:13px;color:#6b7280;margin-bottom:16px">Payment slip: <a href="${slipUrl}" style="color:${t.primary}">View PDF</a></p>
      ` : ''}
      <a href="${t.storeUrl}/admin/gift-cards"
         style="display:inline-block;background:linear-gradient(135deg,${t.primary},${lx(t.primary)});color:white;padding:12px 24px;border-radius:10px;font-weight:700;font-size:14px;text-decoration:none">
        Review &amp; Approve Gift Card →
      </a>
    </div>`, t);
};

// 4. Customer: slip received confirmation
const gcSlipReceivedCustomerHtml = async (card) => {
  const t = await getT();
  return wrapEmail(`
    ${gcHeader('Payment Slip Received ✅', t)}
    <div style="padding:32px">
      <p style="color:#374151">Hi <strong>${card.purchaserName}</strong>,</p>
      <p style="color:#6b7280;font-size:14px">We've received your payment slip for gift card <strong style="color:${t.primary}">${card.code}</strong>. Our team will verify your payment shortly and activate the gift card.</p>
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:16px;margin:20px 0;text-align:center">
        <p style="margin:0;font-size:13px;color:#166534">⏳ Verification usually takes <strong>1–2 business hours</strong>.<br>You'll receive an email once the gift card is activated.</p>
      </div>
      <div style="background:#f8fafc;border-radius:10px;padding:14px;font-size:13px;color:#374151">
        <strong>Gift Card:</strong> ${card.code}<br>
        <strong>Value:</strong> Rs. ${card.initialValue?.toLocaleString()}<br>
        <strong>For:</strong> ${card.recipientName || card.recipientEmail || 'Self'}
      </div>
    </div>`, t);
};

// 5. Purchaser: gift card activated (approved)
const gcActivatedPurchaserHtml = async (card) => {
  const t = await getT();
  return wrapEmail(`
    ${gcHeader('🎉 Gift Card Activated!', t)}
    <div style="padding:32px">
      <p style="color:#374151">Hi <strong>${card.purchaserName}</strong>,</p>
      <p style="color:#6b7280;font-size:14px;margin-bottom:20px">Great news! Your payment has been verified and your gift card is now <strong style="color:#16a34a">active</strong>. ${card.recipientEmail ? `We have also sent the gift card details to ${card.recipientName || card.recipientEmail}.` : ''}</p>
      <div style="background:linear-gradient(135deg,${t.primary},${lx(t.primary)});border-radius:12px;padding:24px;text-align:center;margin-bottom:20px">
        <div style="font-size:36px;margin-bottom:8px">${DESIGN_EMOJIS[card.design] || '🎁'}</div>
        <p style="margin:0 0 4px;font-size:12px;color:rgba(255,255,255,0.7)">Gift Card Code</p>
        <p style="margin:0;font-size:24px;font-weight:900;color:white;font-family:monospace;letter-spacing:2px">${card.code}</p>
        <p style="margin:12px 0 0;font-size:28px;font-weight:800;color:white">Rs. ${card.balance?.toLocaleString()}</p>
        <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.7)">Available Balance</p>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;width:40%">For</td><td style="padding:8px 0;font-size:13px;color:#111">${card.recipientName || card.recipientEmail || 'Self'}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Activated</td><td style="padding:8px 0;font-size:13px;color:#111">${new Date().toLocaleDateString('en-LK', { day: 'numeric', month: 'long', year: 'numeric' })}</td></tr>
        ${card.expiresAt ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Expires</td><td style="padding:8px 0;font-size:13px;color:#111">${new Date(card.expiresAt).toLocaleDateString('en-LK', { day: 'numeric', month: 'long', year: 'numeric' })}</td></tr>` : ''}
        ${card.message ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Your message</td><td style="padding:8px 0;font-size:13px;color:#374151;font-style:italic">"${card.message}"</td></tr>` : ''}
      </table>
      <a href="${t.storeUrl}/gift-cards"
         style="display:inline-block;background:linear-gradient(135deg,${t.primary},${lx(t.primary)});color:white;padding:12px 24px;border-radius:10px;font-weight:700;font-size:14px;text-decoration:none">
        View My Gift Cards →
      </a>
      <p style="margin-top:16px;color:#9ca3af;font-size:12px;text-align:center">Thank you for shopping with ${t.storeName}!</p>
    </div>`, t);
};

// 6. Recipient: you received a gift card!
const gcActivatedRecipientHtml = async (card) => {
  const t = await getT();
  return wrapEmail(`
    ${gcHeader(`You've received a Gift Card! 🎁`, t)}
    <div style="padding:32px">
      <p style="color:#374151">Hi <strong>${card.recipientName || 'there'}</strong>,</p>
      <p style="color:#6b7280;font-size:14px;margin-bottom:20px"><strong>${card.purchaserName}</strong> has sent you a gift card from <a href="${t.storeUrl}" style="color:${t.primary};text-decoration:none">${t.storeName}</a>!</p>
      <div style="background:linear-gradient(135deg,${t.primary},${lx(t.primary)});border-radius:12px;padding:24px;text-align:center;margin-bottom:20px">
        <div style="font-size:40px;margin-bottom:8px">${DESIGN_EMOJIS[card.design] || '🎁'}</div>
        <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.8)">${DESIGN_LABELS[card.design] || 'Gift Card'}</p>
        <p style="margin:12px 0 4px;font-size:28px;font-weight:900;color:white">Rs. ${card.balance?.toLocaleString()}</p>
        <p style="margin:0 0 16px;font-size:12px;color:rgba(255,255,255,0.7)">Gift Card Value</p>
        <div style="background:rgba(255,255,255,0.2);border-radius:8px;padding:12px">
          <p style="margin:0 0 4px;font-size:11px;color:rgba(255,255,255,0.7)">Your Gift Card Code</p>
          <p style="margin:0;font-size:22px;font-weight:900;color:white;font-family:monospace;letter-spacing:2px">${card.code}</p>
        </div>
      </div>
      ${card.message ? `
      <div style="background:#f8fafc;border-left:4px solid ${t.primary};border-radius:0 10px 10px 0;padding:16px;margin-bottom:20px">
        <p style="margin:0 0 4px;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase">A message from ${card.purchaserName}</p>
        <p style="margin:0;font-size:15px;color:#374151;font-style:italic">"${card.message}"</p>
      </div>` : ''}
      <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:14px;margin-bottom:20px;font-size:13px;color:#0369a1">
        <strong>How to use your gift card:</strong><br>
        1. Shop at <a href="${t.storeUrl}" style="color:${t.primary}">${t.storeUrl}</a><br>
        2. Add items to your cart<br>
        3. Enter code <strong>${card.code}</strong> at checkout<br>
        4. The value will be deducted from your total
      </div>
      ${card.expiresAt ? `<p style="font-size:12px;color:#9ca3af;text-align:center">This gift card is valid until ${new Date(card.expiresAt).toLocaleDateString('en-LK', { day: 'numeric', month: 'long', year: 'numeric' })}.</p>` : ''}
      <a href="${t.storeUrl}/shop"
         style="display:inline-block;background:linear-gradient(135deg,${t.primary},${lx(t.primary)});color:white;padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px;text-decoration:none;display:block;text-align:center">
        Start Shopping →
      </a>
    </div>`, t);
};

// 7. Purchaser: gift card rejected (slip not verified)
const gcRejectedPurchaserHtml = async (card, adminNote) => {
  const t = await getT();
  return wrapEmail(`
    ${gcHeader('Payment Verification Update', t)}
    <div style="padding:32px">
      <p style="color:#374151">Hi <strong>${card.purchaserName}</strong>,</p>
      <p style="color:#6b7280;font-size:14px;margin-bottom:20px">Unfortunately, we were unable to verify your payment for gift card <strong style="color:${t.primary}">${card.code}</strong>.</p>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:20px;text-align:center;margin-bottom:20px">
        <p style="margin:0 0 4px;font-size:12px;color:#991b1b">Gift Card ${card.code}</p>
        <p style="margin:0;font-size:20px;font-weight:800;color:#dc2626">Payment Not Verified</p>
      </div>
      ${adminNote ? `
      <div style="background:#f8fafc;border-radius:10px;padding:14px;margin-bottom:20px">
        <p style="margin:0 0 4px;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase">Reason from our team</p>
        <p style="margin:0;font-size:13px;color:#374151">${adminNote}</p>
      </div>` : ''}
      <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:14px;font-size:13px;color:#0369a1;margin-bottom:20px">
        Please re-upload a clear photo of your bank transfer slip in My Orders, or contact our support team for assistance.
      </div>
      <a href="${t.storeUrl}/my-orders"
         style="display:inline-block;background:linear-gradient(135deg,${t.primary},${lx(t.primary)});color:white;padding:12px 24px;border-radius:10px;font-weight:700;font-size:14px;text-decoration:none">
        Go to My Orders →
      </a>
    </div>`, t);
};

// ── Public: browse available gift card templates ───────────────────────────────
router.get('/templates', async (req, res) => {
  try {
    const DESIGNS = [
      { id: 'default', emoji: '🎁', label: 'Classic Gift', bg: '#15803d', price: null },
      { id: 'birthday', emoji: '🎂', label: 'Birthday', bg: '#7c3aed', price: null },
      { id: 'christmas', emoji: '🎄', label: 'Christmas', bg: '#15803d', price: null },
      { id: 'anniversary', emoji: '💝', label: 'Anniversary', bg: '#be185d', price: null },
      { id: 'thankyou', emoji: '💙', label: 'Thank You', bg: '#0369a1', price: null },
    ];
    res.json(DESIGNS);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Public: validate a gift card code ─────────────────────────────────────────
router.post('/validate', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ message: 'Code required' });
    const card = await GiftCard.findOne({ code: code.toUpperCase().trim() });
    if (!card) return res.status(404).json({ message: 'Gift card not found' });
    if (!card.isActive) return res.status(400).json({ message: 'This gift card has not been activated yet' });
    if (card.balance <= 0) return res.status(400).json({ message: 'This gift card has no remaining balance' });
    if (card.expiresAt && new Date() > card.expiresAt) return res.status(400).json({ message: 'This gift card has expired' });
    res.json({ valid: true, balance: card.balance, code: card.code, initialValue: card.initialValue });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Public: check balance by code ─────────────────────────────────────────────
router.get('/balance/:code', async (req, res) => {
  try {
    const card = await GiftCard.findOne({ code: req.params.code.toUpperCase() });
    if (!card) return res.status(404).json({ message: 'Gift card not found' });
    res.json({
      code: card.code, balance: card.balance, initialValue: card.initialValue,
      isActive: card.isActive, expiresAt: card.expiresAt, design: card.design,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Customer: purchase a gift card ────────────────────────────────────────────
router.post('/purchase', auth, async (req, res) => {
  try {
    const { amount, design, recipientName, recipientEmail, recipientPhone, message, paymentMethod } = req.body;
    if (!amount || amount < 100) return res.status(400).json({ message: 'Minimum gift card value is Rs. 100' });

    const code = await ensureUniqueCode();
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    // Fetch admin-configured slip deadline (hours). Default = 24h.
    let slipDeadlineHours = 24;
    try {
      const { Settings } = require('../models/index');
      const cfg = await Settings.findOne({ key: 'gcSlipDeadlineHours' }).lean();
      if (cfg && cfg.value !== undefined && cfg.value !== null && String(cfg.value).trim() !== '') {
        const parsed = Number(cfg.value);
        if (!isNaN(parsed) && parsed > 0) slipDeadlineHours = parsed;
      }
    } catch (_) {}

    const slipDeadlineAt = new Date(Date.now() + slipDeadlineHours * 60 * 60 * 1000);

    const giftCard = await GiftCard.create({
      code,
      initialValue: Number(amount),
      balance: Number(amount),
      purchasedBy: req.user._id,
      purchaserEmail: req.user.email,
      purchaserName: `${req.user.firstName} ${req.user.lastName}`,
      recipientName: recipientName || `${req.user.firstName} ${req.user.lastName}`,
      recipientEmail: recipientEmail || req.user.email,
      recipientPhone: recipientPhone || '',
      message: message || '',
      design: design || 'default',
      paymentMethod: paymentMethod || 'bank_transfer',
      paymentStatus: 'pending',
      isActive: false,
      expiresAt,
      slipDeadlineAt,
    });

    // Admin in-app notification
    await Notification.create({
      type: 'gift_card',
      title: '🎁 New Gift Card Purchase',
      message: `${req.user.firstName} ${req.user.lastName} purchased a Rs. ${amount} gift card`,
      link: '/admin/gift-cards',
      data: { giftCardId: giftCard._id, code: giftCard.code },
    }).catch(() => {});

    // Emails (non-blocking)
    const adminEmail = await getAdminEmail().catch(() => null);

    if (adminEmail && await isEmailEnabled('gift_card_purchase_admin')) {
      sendMail({
        to: adminEmail,
        subject: `🎁 New Gift Card Purchase — ${code} | Rs. ${Number(amount).toLocaleString()}`,
        html: await gcNewPurchaseAdminHtml(giftCard),
      }).catch(err => console.error('[GC PURCHASE ADMIN EMAIL]', err.message));
    }

    // Purchaser confirmation email
    if (await isEmailEnabled('gift_card_purchase_customer')) {
      sendMail({
        to: req.user.email,
        subject: `🎁 Gift Card Order Placed — ${code}`,
        html: await gcPurchaseCustomerHtml(giftCard),
      }).catch(err => console.error('[GC PURCHASE CUSTOMER EMAIL]', err.message));
    }

    res.status(201).json({
      success: true,
      giftCard,
      message: 'Gift card order placed! Upload your payment slip in My Orders to activate it.',
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Customer: upload payment slip for gift card ────────────────────────────────
// Wrap multer in a middleware that catches its errors and returns JSON (not HTML)
const uploadSlipMiddleware = (req, res, next) => {
  uploadSlip.single('slip')(req, res, (err) => {
    if (err) {
      console.error('[GC SLIP MULTER ERROR]', err.message);
      return res.status(400).json({ message: `File upload error: ${err.message}` });
    }
    next();
  });
};

router.post('/:id/payment-slip', auth, uploadSlipMiddleware, async (req, res) => {
  try {
    const card = await GiftCard.findById(req.params.id);
    if (!card) return res.status(404).json({ message: 'Gift card not found' });
    if (String(card.purchasedBy) !== String(req.user._id)) return res.status(403).json({ message: 'Not authorized' });
    if (!req.file) return res.status(400).json({ message: 'No file uploaded. Please attach an image or PDF.' });

    let slipUrl;
    if (req.file.path && req.file.path.startsWith('http')) {
      slipUrl = req.file.path;
    } else {
      const relPath = `/uploads/gift-card-slips/${req.file.filename}`;
      slipUrl = absoluteSlipUrl(relPath);
      card.paymentSlip = relPath;
    }
    if (req.file.path && req.file.path.startsWith('http')) {
      card.paymentSlip = req.file.path;
    }
    card.paymentSlipUploadedAt = new Date();
    card.paymentStatus = 'pending'; // awaiting admin review
    await card.save();

    // Admin in-app notification
    await Notification.create({
      type: 'gift_card',
      title: '📎 Gift Card Slip Uploaded',
      message: `${card.purchaserName} uploaded a payment slip for gift card ${card.code} — Rs. ${card.initialValue?.toLocaleString()}`,
      link: '/admin/gift-cards',
      data: { giftCardId: card._id, code: card.code },
    }).catch(() => {});

    const adminEmail = await getAdminEmail().catch(() => null);

    // Admin email: slip uploaded
    if (adminEmail && await isEmailEnabled('gift_card_slip_admin')) {
      sendMail({
        to: adminEmail,
        subject: `📎 Gift Card Slip Uploaded — ${card.code}`,
        html: await gcSlipUploadedAdminHtml(card, slipUrl),
      }).catch(err => console.error('[GC SLIP ADMIN EMAIL]', err.message));
    }

    // Customer confirmation: slip received
    if (await isEmailEnabled('gift_card_slip_customer')) {
      sendMail({
        to: card.purchaserEmail,
        subject: `✅ Payment Slip Received — Gift Card ${card.code}`,
        html: await gcSlipReceivedCustomerHtml(card),
      }).catch(err => console.error('[GC SLIP CUSTOMER EMAIL]', err.message));
    }

    res.json({ success: true, message: 'Payment slip uploaded. Admin will review and activate your gift card.' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Customer: my purchased gift cards ─────────────────────────────────────────
router.get('/my-cards', auth, async (req, res) => {
  try {
    const cards = await GiftCard.find({ purchasedBy: req.user._id }).sort({ createdAt: -1 });
    res.json(cards);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Admin: get all gift cards ──────────────────────────────────────────────────
router.get('/admin/all', adminAuth, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status === 'pending') filter.paymentStatus = 'pending';
    if (status === 'active') filter.isActive = true;
    if (status === 'used') filter.balance = 0;
    if (status === 'slip_uploaded') { filter.paymentSlip = { $exists: true, $ne: null }; filter.isActive = false; }
    const total = await GiftCard.countDocuments(filter);
    const cards = await GiftCard.find(filter)
      .populate('purchasedBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    res.json({ cards, total, pages: Math.ceil(total / limit) });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Admin: create gift card manually ──────────────────────────────────────────
router.post('/admin/create', adminAuth, async (req, res) => {
  try {
    const { amount, design, expiryDays, isActive, adminNote } = req.body;
    if (!amount || amount < 1) return res.status(400).json({ message: 'Amount required' });
    const code = await ensureUniqueCode();
    const expiresAt = new Date(Date.now() + (Number(expiryDays) || 365) * 24 * 60 * 60 * 1000);

    const giftCard = await GiftCard.create({
      code,
      initialValue: Number(amount),
      balance: Number(amount),
      design: design || 'default',
      paymentStatus: 'paid',
      isActive: isActive !== false,
      activatedAt: isActive !== false ? new Date() : undefined,
      adminNote: adminNote || 'Created by admin',
      expiresAt,
    });
    res.status(201).json(giftCard);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Admin: approve gift card (slip verified) ───────────────────────────────────
router.put('/admin/:id/approve', adminAuth, async (req, res) => {
  try {
    const { adminNote } = req.body;
    const card = await GiftCard.findByIdAndUpdate(
      req.params.id,
      { isActive: true, paymentStatus: 'paid', activatedAt: new Date(), ...(adminNote && { adminNote }) },
      { new: true }
    ).populate('purchasedBy', 'firstName lastName email');
    if (!card) return res.status(404).json({ message: 'Not found' });

    await Notification.create({
      type: 'gift_card',
      title: '✅ Gift Card Approved & Activated',
      message: `Gift card ${card.code} (Rs. ${card.initialValue?.toLocaleString()}) approved for ${card.purchaserName}`,
      link: '/admin/gift-cards',
      data: { giftCardId: card._id, code: card.code },
    }).catch(() => {});

    if (card.purchaserEmail && await isEmailEnabled('gift_card_activated_purchaser')) {
      sendMail({
        to: card.purchaserEmail,
        subject: `🎉 Gift Card Activated — ${card.code} | ${(await getT()).storeName}`,
        html: await gcActivatedPurchaserHtml(card),
      }).catch(err => console.error('[GC APPROVE PURCHASER EMAIL]', err.message));
    }
    if (card.recipientEmail && card.recipientEmail !== card.purchaserEmail && await isEmailEnabled('gift_card_activated_recipient')) {
      sendMail({
        to: card.recipientEmail,
        subject: `🎁 You've received a Gift Card from ${card.purchaserName}!`,
        html: await gcActivatedRecipientHtml(card),
      }).catch(err => console.error('[GC APPROVE RECIPIENT EMAIL]', err.message));
    }

    res.json(card);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Admin: activate gift card (legacy alias) ───────────────────────────────────
router.put('/admin/:id/activate', adminAuth, async (req, res) => {
  try {
    const card = await GiftCard.findByIdAndUpdate(
      req.params.id,
      { isActive: true, paymentStatus: 'paid', activatedAt: new Date() },
      { new: true }
    ).populate('purchasedBy', 'firstName lastName email');
    if (!card) return res.status(404).json({ message: 'Not found' });

    await Notification.create({
      type: 'gift_card',
      title: '✅ Gift Card Activated',
      message: `Gift card ${card.code} (Rs. ${card.initialValue?.toLocaleString()}) activated for ${card.purchaserName}`,
      link: '/admin/gift-cards',
      data: { giftCardId: card._id, code: card.code },
    }).catch(() => {});

    if (card.purchaserEmail && await isEmailEnabled('gift_card_activated_purchaser')) {
      sendMail({
        to: card.purchaserEmail,
        subject: `🎉 Gift Card Activated — ${card.code} | ${(await getT()).storeName}`,
        html: await gcActivatedPurchaserHtml(card),
      }).catch(err => console.error('[GC ACTIVATE PURCHASER EMAIL]', err.message));
    }
    if (card.recipientEmail && card.recipientEmail !== card.purchaserEmail && await isEmailEnabled('gift_card_activated_recipient')) {
      sendMail({
        to: card.recipientEmail,
        subject: `🎁 You've received a Gift Card from ${card.purchaserName}!`,
        html: await gcActivatedRecipientHtml(card),
      }).catch(err => console.error('[GC ACTIVATE RECIPIENT EMAIL]', err.message));
    }

    res.json(card);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Admin: reject gift card slip ───────────────────────────────────────────────
router.put('/admin/:id/reject', adminAuth, async (req, res) => {
  try {
    const { rejectionNote } = req.body;
    const card = await GiftCard.findByIdAndUpdate(
      req.params.id,
      {
        isActive: false,
        paymentStatus: 'pending',
        paymentSlip: null,
        paymentSlipUploadedAt: null,
        rejectedAt: new Date(),
        ...(rejectionNote && { rejectionNote }),
      },
      { new: true }
    ).populate('purchasedBy', 'firstName lastName email');
    if (!card) return res.status(404).json({ message: 'Not found' });

    await Notification.create({
      type: 'gift_card',
      title: '❌ Gift Card Slip Rejected',
      message: `Gift card ${card.code} slip rejected — awaiting re-upload from ${card.purchaserName}`,
      link: '/admin/gift-cards',
    }).catch(() => {});

    if (card.purchaserEmail && await isEmailEnabled('gift_card_rejected_purchaser')) {
      sendMail({
        to: card.purchaserEmail,
        subject: `Gift Card Payment Update — ${card.code}`,
        html: await gcRejectedPurchaserHtml(card, rejectionNote),
      }).catch(err => console.error('[GC REJECT EMAIL]', err.message));
    }

    res.json(card);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Admin: deactivate / disable gift card (legacy) ────────────────────────────
router.put('/admin/:id/deactivate', adminAuth, async (req, res) => {
  try {
    const { adminNote } = req.body;
    const card = await GiftCard.findByIdAndUpdate(
      req.params.id,
      { isActive: false, paymentStatus: 'pending', ...(adminNote && { adminNote }) },
      { new: true }
    ).populate('purchasedBy', 'firstName lastName email');
    if (!card) return res.status(404).json({ message: 'Not found' });

    await Notification.create({
      type: 'gift_card',
      title: '❌ Gift Card Rejected',
      message: `Gift card ${card.code} payment slip rejected for ${card.purchaserName}`,
      link: '/admin/gift-cards',
    }).catch(() => {});

    if (card.purchaserEmail && await isEmailEnabled('gift_card_rejected_purchaser')) {
      sendMail({
        to: card.purchaserEmail,
        subject: `Gift Card Payment Update — ${card.code}`,
        html: await gcRejectedPurchaserHtml(card, adminNote),
      }).catch(err => console.error('[GC REJECT EMAIL]', err.message));
    }

    res.json(card);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Admin: get slip deadline config ───────────────────────────────────────────
router.get('/admin/config', adminAuth, async (req, res) => {
  try {
    const { Settings } = require('../models/index');
    const cfg = await Settings.findOne({ key: 'gcSlipDeadlineHours' }).lean();
    const hours = (cfg && cfg.value !== null && cfg.value !== undefined)
      ? Number(cfg.value)
      : 24;
    res.json({ gcSlipDeadlineHours: isNaN(hours) ? 24 : hours });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Admin: save slip deadline config ──────────────────────────────────────────
router.put('/admin/config', adminAuth, async (req, res) => {
  try {
    const { gcSlipDeadlineHours } = req.body;
    const hours = Number(gcSlipDeadlineHours);
    if (isNaN(hours) || hours < 1) return res.status(400).json({ message: 'Invalid hours (min 1)' });

    const { Settings } = require('../models/index');
    await Settings.findOneAndUpdate(
      { key: 'gcSlipDeadlineHours' },
      { $set: { key: 'gcSlipDeadlineHours', value: hours, group: 'gift_cards', updatedAt: new Date() } },
      { upsert: true }
    );
    res.json({ success: true, gcSlipDeadlineHours: hours });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Admin: update gift card (adjust balance, note etc.) ───────────────────────
router.put('/admin/:id', adminAuth, async (req, res) => {
  try {
    const card = await GiftCard.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(card);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Slip expiry email (purchaser) ─────────────────────────────────────────────
const gcSlipExpiredHtml = async (card) => {
  const t = await getT();
  return wrapEmail(`
    ${gcHeader('⏰ Gift Card Order Cancelled', t)}
    <div style="padding:32px">
      <p style="color:#374151">Hi <strong>${card.purchaserName}</strong>,</p>
      <p style="color:#6b7280;font-size:14px;margin-bottom:20px">
        Your gift card order <strong style="color:${t.primary}">${card.code}</strong>
        has been <strong style="color:#dc2626">cancelled</strong> because a payment slip was not uploaded
        within the required time period.
      </p>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px;text-align:center;margin-bottom:20px">
        <p style="margin:0;font-size:20px;font-weight:800;color:#dc2626">Order Expired — No Slip Uploaded</p>
        <p style="margin:8px 0 0;font-size:13px;color:#991b1b">Gift Card: ${card.code} · Rs. ${card.initialValue?.toLocaleString()}</p>
      </div>
      <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:14px;font-size:13px;color:#0369a1;margin-bottom:20px">
        If you did complete a bank transfer, please contact our support team with your transfer reference number and we'll reinstate your order.
      </div>
      <a href="${t.storeUrl}/gift-cards"
         style="display:inline-block;background:linear-gradient(135deg,${t.primary},${lx(t.primary)});color:white;padding:12px 24px;border-radius:10px;font-weight:700;font-size:14px;text-decoration:none">
        Purchase a New Gift Card →
      </a>
    </div>`, t);
};

// ── Slip expiry cron (runs every 15 min) ──────────────────────────────────────
const runSlipExpiryCron = async () => {
  // Skip tick if MongoDB is not connected — avoids spamming error logs during Atlas blips
  if (mongoose.connection.readyState !== 1) return;
  try {
    const now = new Date();
    const expired = await GiftCard.find({
      isActive: false,
      paymentExpired: { $ne: true },
      paymentSlip: { $in: [null, undefined, ''] },
      slipDeadlineAt: { $exists: true, $lte: now },
      paymentStatus: 'pending',
    });

    for (const card of expired) {
      card.paymentExpired = true;
      card.paymentStatus = 'failed';
      await card.save();

      await Notification.create({
        type: 'gift_card',
        title: '⏰ Gift Card Expired — No Slip',
        message: `Gift card ${card.code} (Rs. ${card.initialValue?.toLocaleString()}) from ${card.purchaserName} expired without a payment slip`,
        link: '/admin/gift-cards',
      }).catch(() => {});

      if (card.purchaserEmail) {
        sendMail({
          to: card.purchaserEmail,
          subject: `⏰ Gift Card Order Expired — ${card.code}`,
          html: await gcSlipExpiredHtml(card),
        }).catch(err => console.error('[GC EXPIRY EMAIL]', err.message));
      }
    }

    if (expired.length > 0) {
      console.log(`[GC Cron] Expired ${expired.length} gift card(s) without slip.`);
    }
  } catch (err) {
    console.error('[GC Cron Error]', err.message);
  }
};

// Start cron: check every 15 minutes
setInterval(runSlipExpiryCron, 15 * 60 * 1000);
// Also run immediately on startup (after a short delay so DB is ready)
setTimeout(runSlipExpiryCron, 10000);

module.exports = router;