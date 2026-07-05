/**
 * services/templateRenderer.js
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TEMPLATE MODE RENDERING ENGINE — standalone, server-side
 * ─────────────────────────────────────────────────────────────────────────────
 * Composites a background-removed product cutout onto a PNG template
 * background, then renders text fields (name, price, discount, CTA,
 * description) on top, all positioned according to a per-template JSON
 * config in templates/configs/*.json.
 *
 * Does NOT touch, import, or depend on anything in the existing AI
 * generation flow (routes/ai.js, the cinematic canvas renderer in
 * AIPostCreator.js, or generate-photoreal). Fully isolated module.
 *
 * Text is rendered via an SVG layer (Sharp composites SVG buffers
 * natively through librsvg), which keeps this dependency-light — no
 * node-canvas / native canvas bindings required, just `sharp` which is
 * already a backend dependency.
 *
 * Usage:
 *   const { renderTemplate, listTemplates, getTemplateConfig } = require('./templateRenderer');
 *   const pngBuffer = await renderTemplate('sale-burst', {
 *     productImageBuffer,           // Buffer — background-removed PNG
 *     name, price, originalPrice, discount, cta, description,
 *   });
 */
'use strict';

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const CONFIGS_DIR = path.join(__dirname, '../templates/configs');
const ASSETS_DIR = path.join(__dirname, '../templates/assets');

/* ══════════════════════════════════════════════════════════════════════════
   CONFIG LOADING
══════════════════════════════════════════════════════════════════════════ */
function listTemplates() {
  const files = fs.readdirSync(CONFIGS_DIR).filter(f => f.endsWith('.json'));
  const results = [];
  for (const f of files) {
    try {
      const raw = fs.readFileSync(path.join(CONFIGS_DIR, f), 'utf8').trim();
      if (!raw) { console.warn(`[templateRenderer] Skipping empty config: ${f}`); continue; }
      const cfg = JSON.parse(raw);
      if (!cfg.id || !cfg.label) { console.warn(`[templateRenderer] Skipping invalid config (missing id/label): ${f}`); continue; }
      results.push({
        id: cfg.id,
        label: cfg.label,
        description: cfg.description || '',
        thumbnailUrl: `/api/ai-post-creator/templates/${cfg.id}/thumbnail`,
      });
    } catch (err) {
      console.warn(`[templateRenderer] Skipping malformed config ${f}:`, err.message);
    }
  }
  return results;
}

function getTemplateConfig(templateId) {
  const safeId = String(templateId || '').replace(/[^a-z0-9-]/gi, '');
  const configPath = path.join(CONFIGS_DIR, `${safeId}.json`);
  if (!fs.existsSync(configPath)) {
    throw new Error(`Unknown template: "${templateId}"`);
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function getTemplateAssetPath(templateId) {
  const cfg = getTemplateConfig(templateId);
  const assetPath = path.join(ASSETS_DIR, cfg.background);
  if (!fs.existsSync(assetPath)) {
    throw new Error(`Template background image missing: ${cfg.background}`);
  }
  return assetPath;
}

/* ══════════════════════════════════════════════════════════════════════════
   SMALL HELPERS
══════════════════════════════════════════════════════════════════════════ */
function escapeXml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const fmtLKR = (n) => `Rs. ${Number(n || 0).toLocaleString()}`;

/** Very small condition evaluator for `showIf` — only supports the
 *  whitelisted comparisons used in templates/configs/*.json. No eval(). */
function evalShowIf(expr, data) {
  if (!expr) return true;
  const clauses = expr.split('&&').map(s => s.trim());
  return clauses.every(clause => {
    const m = clause.match(/^(\w+)\s*(>|>=|<|<=|==)\s*(-?\d+(\.\d+)?)$/);
    if (!m) return true; // unrecognised clause — fail open, don't block rendering
    const [, key, op, valStr] = m;
    const left = Number(data[key]) || 0;
    const right = Number(valStr);
    switch (op) {
      case '>':  return left > right;
      case '>=': return left >= right;
      case '<':  return left < right;
      case '<=': return left <= right;
      case '==': return left === right;
      default:   return true;
    }
  });
}

/** Word-wraps text to fit `maxWidth` px at a given font size, using an
 *  approximate average character width (no canvas measureText available
 *  server-side without native bindings). Slightly conservative on purpose
 *  so text never overflows its box. */
function wrapText(text, fontSize, maxWidth, maxLines) {
  const avgCharWidth = fontSize * 0.56;
  const maxCharsPerLine = Math.max(1, Math.floor(maxWidth / avgCharWidth));
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (test.length > maxCharsPerLine && current) {
      lines.push(current);
      if (lines.length >= maxLines) break;
      current = word;
    } else {
      current = test;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);

  // Truncate last line with ellipsis if we still have leftover words
  const consumedWords = lines.join(' ').split(/\s+/).length;
  if (lines.length === maxLines && consumedWords < words.length) {
    const last = lines[maxLines - 1];
    lines[maxLines - 1] = last.length > 3 ? last.slice(0, -3).trimEnd() + '…' : last + '…';
  }
  return lines.length ? lines : [''];
}

/* ══════════════════════════════════════════════════════════════════════════
   SVG TEXT/SHAPE LAYER BUILDERS
══════════════════════════════════════════════════════════════════════════ */
function buildTextSvgFragment(field, rawValue, data) {
  if (!field) return '';
  if (field.showIf && !evalShowIf(field.showIf, data)) return '';

  let text = rawValue;
  if (field.prefix) text = `${field.prefix}${text}`;
  if (field.suffix) text = `${text}${field.suffix}`;
  if (field.uppercase) text = String(text).toUpperCase();
  if (text === '' || text === null || text === undefined) return '';

  const fontSize = field.fontSize || 32;
  const fontWeight = field.fontWeight || 400;
  const fontFamily = field.fontFamily || 'Arial, sans-serif';
  const color = field.color || '#000000';
  const align = field.align || 'left';
  const maxLines = field.maxLines || 1;
  const lineHeight = field.lineHeight || 1.2;
  const letterSpacing = field.letterSpacing || 0;

  const lines = field.width
    ? wrapText(text, fontSize, field.width, maxLines)
    : [String(text)];

  const anchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start';
  const textX = align === 'center' ? (field.width || 0) / 2 : align === 'right' ? (field.width || 0) : 0;

  const shadowFilterId = `shadow-${Math.round(field.x)}-${Math.round(field.y)}`;
  let defs = '';
  let filterAttr = '';
  if (field.shadow?.enabled) {
    filterAttr = ` filter="url(#${shadowFilterId})"`;
    defs = `
      <filter id="${shadowFilterId}" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="${field.shadow.offsetY || 2}" stdDeviation="${(field.shadow.blur || 6) / 2}"
          flood-color="${field.shadow.color || 'rgba(0,0,0,0.4)'}" flood-opacity="${field.shadow.opacity ?? 1}"/>
      </filter>`;
  }

  const decoration = field.strikethrough ? ' text-decoration="line-through"' : '';

  const tspans = lines.map((line, i) =>
    `<tspan x="${textX}" y="${i * fontSize * lineHeight}">${escapeXml(line)}</tspan>`
  ).join('');

  return `
    <svg x="${field.x}" y="${field.y}" width="${field.width || 1000}" height="${fontSize * lineHeight * lines.length + 10}" overflow="visible">
      ${defs}
      <text font-family="${fontFamily}" font-size="${fontSize}" font-weight="${fontWeight}"
        fill="${color}" text-anchor="${anchor}" letter-spacing="${letterSpacing}"${decoration}${filterAttr}
        dominant-baseline="hanging">${tspans}</text>
    </svg>`;
}

function buildPillSvgFragment(field, rawValue, data) {
  // Used for fields that have a `background` — rendered as a rounded pill/box
  // behind the text (e.g. CTA buttons, discount badges in some templates).
  if (!field?.background) return buildTextSvgFragment(field, rawValue, data);
  if (field.showIf && !evalShowIf(field.showIf, data)) return '';

  let text = rawValue;
  if (field.prefix) text = `${field.prefix}${text}`;
  if (field.suffix) text = `${text}${field.suffix}`;
  if (field.uppercase) text = String(text).toUpperCase();
  if (text === '' || text === null || text === undefined) return '';

  const w = field.width || 200;
  const h = field.height || 70;
  const r = field.borderRadius ?? h / 2;
  const fontSize = field.fontSize || 28;

  return `
    <svg x="${field.x}" y="${field.y}" width="${w}" height="${h}" overflow="visible">
      <rect width="${w}" height="${h}" rx="${r}" ry="${r}" fill="${field.background}"/>
      <text x="${w / 2}" y="${h / 2}" font-family="${field.fontFamily || 'Arial, sans-serif'}"
        font-size="${fontSize}" font-weight="${field.fontWeight || 700}" fill="${field.color || '#000'}"
        text-anchor="middle" dominant-baseline="central">${escapeXml(String(text))}</text>
    </svg>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   MAIN RENDER FUNCTION
══════════════════════════════════════════════════════════════════════════ */
/**
 * @param {string} templateId
 * @param {object} data
 * @param {Buffer} data.productImageBuffer  - background-removed product PNG (required)
 * @param {string} data.name
 * @param {number} data.price
 * @param {number} [data.originalPrice]
 * @param {number} [data.discount]          - percent, e.g. 25
 * @param {string} [data.cta]
 * @param {string} [data.description]
 * @returns {Promise<Buffer>} rendered 1080x1080 PNG buffer
 */
async function renderTemplate(templateId, data) {
  const cfg = getTemplateConfig(templateId);
  const bgPath = getTemplateAssetPath(templateId);
  const { width: W, height: H } = cfg.canvas;

  if (!data.productImageBuffer) {
    throw new Error('productImageBuffer is required (background-removed product cutout)');
  }

  const fieldData = {
    name: data.name || '',
    price: Number(data.price) || 0,
    originalPrice: Number(data.originalPrice) || 0,
    discount: Number(data.discount) || 0,
    cta: data.cta || 'Shop Now',
    description: data.description || '',
  };

  /* ── 1. Prepare product image: resize to fit its slot, contain-fit ── */
  const pi = cfg.productImage;
  let productResized = await sharp(data.productImageBuffer)
    .resize(pi.width, pi.height, { fit: pi.fit || 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  // Optional soft drop shadow under the product cutout, built via a blurred
  // alpha silhouette composited beneath the product layer.
  const compositeLayers = [];
  if (pi.shadow?.enabled) {
    const shadowSilhouette = await sharp(data.productImageBuffer)
      .resize(pi.width, pi.height, { fit: pi.fit || 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .ensureAlpha()
      .tint({ r: 0, g: 0, b: 0 })
      .blur(pi.shadow.blur || 30)
      .toBuffer();
    compositeLayers.push({
      input: shadowSilhouette,
      left: pi.x,
      top: pi.y + (pi.shadow.offsetY || 20),
      blend: 'over',
      opacity: pi.shadow.opacity ?? 0.3,
    });
  }

  compositeLayers.push({ input: productResized, left: pi.x, top: pi.y });

  /* ── 2. Build the text/shape SVG overlay (one combined SVG covers all fields) ── */
  const fieldSvgParts = Object.entries(cfg.fields || {}).map(([key, field]) => {
    const rawValue = key === 'price' ? fieldData.price
      : key === 'originalPrice' ? fieldData.originalPrice
      : key === 'discount' ? fieldData.discount
      : fieldData[key];
    return field.background
      ? buildPillSvgFragment(field, rawValue, fieldData)
      : buildTextSvgFragment(field, rawValue, fieldData);
  }).join('\n');

  const overlaySvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${fieldSvgParts}</svg>`;
  const overlayBuffer = Buffer.from(overlaySvg);

  /* ── 3. Composite: background → shadow → product → text/shape overlay ── */
  const finalBuffer = await sharp(bgPath)
    .resize(W, H)
    .composite([
      ...compositeLayers,
      { input: overlayBuffer, left: 0, top: 0 },
    ])
    .png({ quality: 92 })
    .toBuffer();

  return finalBuffer;
}

module.exports = {
  renderTemplate,
  listTemplates,
  getTemplateConfig,
  getTemplateAssetPath,
};