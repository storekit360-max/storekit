/**
 * One-off script to generate placeholder 1080x1080 template background PNGs
 * so the Template Mode engine has something real to render against.
 *
 * These are intentionally simple — swap them out by dropping replacement
 * PNGs (same filenames, same 1080x1080 canvas) into templates/assets/,
 * matching the "background" field in each templates/configs/*.json.
 *
 * Run: node templates/generate-placeholders.js
 */
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const ASSETS_DIR = path.join(__dirname, 'assets');
if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });

const W = 1080, H = 1080;

/* ── 1. Sale Burst — bold orange/red radial burst ── */
const saleBurstSvg = `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="50%" cy="38%" r="75%">
      <stop offset="0%" stop-color="#ff6b35"/>
      <stop offset="55%" stop-color="#e8401f"/>
      <stop offset="100%" stop-color="#a8200d"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <g opacity="0.12" stroke="#ffffff" stroke-width="3">
    ${Array.from({ length: 16 }, (_, i) => {
      const angle = (i / 16) * Math.PI * 2;
      const x2 = W / 2 + Math.cos(angle) * 900;
      const y2 = H / 2 + Math.sin(angle) * 900;
      return `<line x1="${W / 2}" y1="${H / 2}" x2="${x2}" y2="${y2}"/>`;
    }).join('\n    ')}
  </g>
  <rect x="0" y="860" width="${W}" height="${H - 860}" fill="#000000" opacity="0.22"/>
</svg>`;

/* ── 2. Minimal Studio — clean light grey/white backdrop ── */
const minimalStudioSvg = `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#fafafa"/>
      <stop offset="70%" stop-color="#f1f1f3"/>
      <stop offset="100%" stop-color="#e8e8eb"/>
    </linearGradient>
    <radialGradient id="spot" cx="50%" cy="38%" r="55%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#spot)"/>
  <ellipse cx="${W / 2}" cy="700" rx="380" ry="40" fill="#000000" opacity="0.06"/>
</svg>`;

/* ── 3. Bold Banner — diagonal colour-blocked split ── */
const boldBannerSvg = `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="left" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2d2d5a"/>
      <stop offset="100%" stop-color="#1a1a2e"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#ffd600"/>
  <polygon points="0,0 720,0 480,${H} 0,${H}" fill="url(#left)"/>
  <circle cx="900" cy="180" r="220" fill="#ffffff" opacity="0.08"/>
  <circle cx="950" cy="850" r="160" fill="#1a1a2e" opacity="0.06"/>
</svg>`;

async function build(name, svg) {
  const outPath = path.join(ASSETS_DIR, `${name}.png`);
  await sharp(Buffer.from(svg)).png().toFile(outPath);
  console.log(`✓ ${outPath}`);
}

(async () => {
  await build('sale-burst', saleBurstSvg);
  await build('minimal-studio', minimalStudioSvg);
  await build('bold-banner', boldBannerSvg);
  console.log('\nPlaceholder templates generated. Replace these PNGs in templates/assets/ any time — keep filenames and 1080x1080 size, or update the "background" field in the matching templates/configs/*.json.');
})();