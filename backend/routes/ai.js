/**
 * routes/ai.js  — AI autofill helpers
 * Primary: OpenRouter | Fallback: Gemini
 *
 * Endpoints:
 *   POST /api/ai/autofill   → { brand, shortDescription }
 *   POST /api/ai/tags       → { tags: string[] }          ← HIGH-QUALITY SEO tags
 *   POST /api/ai/seo        → { metaTitle, metaDesc, focusKeyword, schema }
 *   GET  /api/ai/status     → { provider, status }
 */
const express = require('express');
const router  = express.Router();
const { adminAuth } = require('../middleware/auth');

router.use(adminAuth);

/* ══════════════════════════════════════════════════════════════════
   AI CALLERS
══════════════════════════════════════════════════════════════════ */

async function callOpenRouter(systemMsg, userMsg, maxTokens = 1000) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'HTTP-Referer':  process.env.FRONTEND_URL || 'https://storekit.local',
      'X-Title':       'StoreKit',
    },
    body: JSON.stringify({
      model:       'meta-llama/llama-3.1-8b-instruct',
      max_tokens:  maxTokens,
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user',   content: userMsg   },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

async function callGemini(prompt, maxTokens = 1000) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.2 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
}

async function callAI(systemMsg, userMsg, maxTokens = 1000) {
  if (process.env.OPENROUTER_API_KEY) {
    try {
      return await callOpenRouter(systemMsg, userMsg, maxTokens);
    } catch (err) {
      console.warn('[AI] OpenRouter failed, trying Gemini fallback:', err.message);
      if (process.env.GEMINI_API_KEY)
        return await callGemini(`${systemMsg}\n\n${userMsg}`, maxTokens);
      throw err;
    }
  }
  if (process.env.GEMINI_API_KEY)
    return callGemini(`${systemMsg}\n\n${userMsg}`, maxTokens);
  throw new Error('No AI key configured. Set OPENROUTER_API_KEY or GEMINI_API_KEY in your .env');
}

/* ── safe JSON extractor ── */
function extractJSON(raw, type = 'object') {
  const open  = type === 'array' ? '[' : '{';
  const close = type === 'array' ? ']' : '}';
  const start = raw.indexOf(open);
  const end   = raw.lastIndexOf(close);
  if (start === -1 || end === -1 || end <= start)
    throw new Error(`No JSON ${type} in response: ` + raw.slice(0, 120));
  return JSON.parse(raw.slice(start, end + 1));
}

/* ══════════════════════════════════════════════════════════════════
   POST /api/ai/autofill  →  { brand, shortDescription }
   shortDescription is SEO-optimised: 110-155 chars, buying-intent,
   Sri Lanka market signals, Google-ready.
══════════════════════════════════════════════════════════════════ */
router.post('/autofill', async (req, res) => {
  const { name, category, brand: existingBrand, price, salePrice } = req.body;
  if (!name || name.trim().length < 3)
    return res.status(400).json({ message: 'Product name too short' });

  const n = name.trim();

  const ctxLines = [
    existingBrand && `Brand: ${existingBrand}`,
    category      && `Category: ${category}`,
    price         && `Price: Rs.${price}${salePrice ? ` (sale Rs.${salePrice})` : ''}`,
  ].filter(Boolean).join('\n');

  const systemMsg = 'You are an expert e-commerce SEO copywriter for a Sri Lankan online store. You output ONLY valid JSON. No markdown. No explanation.';

  const userMsg = [
    `Generate autofill fields for this product on storekit.local (Sri Lanka e-commerce).`,
    ``,
    `Product name: "${n}"`,
    ctxLines ? `Context:\n${ctxLines}` : '',
    ``,
    `Reply ONLY with this JSON, nothing else:`,
    `{"brand":"BRAND_HERE","shortDescription":"DESC_HERE"}`,
    ``,
    `BRAND_HERE rules:`,
    `- The manufacturer/brand name (extract from product name or context)`,
    `- Empty string "" if genuinely unknown`,
    ``,
    `DESC_HERE rules — this appears directly in Google search results:`,
    `- Length: 110-155 characters EXACTLY`,
    `- Open with the key feature or benefit — NOT the product name`,
    `- Include ONE buying-intent phrase: "buy online in Sri Lanka", "best price in Sri Lanka", or "fast delivery across Sri Lanka"`,
    `- Mention a real spec or use-case that differentiates this product`,
    `- End with: "Fast delivery across Sri Lanka." or "Order now at StoreKit."`,
    `- Plain English only — no markdown, no asterisks, no ALL CAPS, no emoji`,
    `- Do NOT open with the brand name or product name`,
    `- Do NOT use vague filler like "high quality", "perfect for everyone"`,
    ``,
    `GOOD example for "Sony XV800 X-Series Wireless Party Speaker":`,
    `"Powerful 360-degree party sound with built-in mic input, LED lighting and IPX4 splash-proof body. Buy the Sony XV800 online with fast delivery across Sri Lanka."`,
    ``,
    `BAD example (too short, generic, no Sri Lanka signal):`,
    `"Wireless party speaker with great sound quality."`,
  ].filter(s => s !== undefined).join('\n');

  try {
    const raw    = await callAI(systemMsg, userMsg, 500);
    const parsed = extractJSON(raw, 'object');

    const shortDescription = (parsed.shortDescription || '').trim();
    if (shortDescription.length < 50) {
      console.warn('[AI /autofill] shortDescription too short (' + shortDescription.length + ' chars):', shortDescription);
    }

    res.json({
      brand:            (parsed.brand            || '').trim(),
      shortDescription: shortDescription,
    });
  } catch (err) {
    console.error('[AI /autofill]', err.message);
    res.status(500).json({ message: 'AI autofill failed: ' + err.message });
  }
});

/* ══════════════════════════════════════════════════════════════════
   POST /api/ai/tags  →  { tags: string[] }
   HIGH-QUALITY SEO tags — buyer-intent + long-tail keywords
══════════════════════════════════════════════════════════════════ */
router.post('/tags', async (req, res) => {
  const { name, category, brand, description, price } = req.body;
  if (!name || name.trim().length < 3)
    return res.status(400).json({ message: 'Product name too short' });

  const ctx = [
    name,
    brand     && `Brand: ${brand}`,
    category  && `Category: ${category}`,
    price     && `Price: Rs.${price}`,
    description && `Description snippet: ${String(description).replace(/<[^>]+>/g,'').slice(0,200)}`,
  ].filter(Boolean).join('\n');

  const systemMsg = 'You are an expert e-commerce SEO specialist. You output ONLY valid JSON arrays. No markdown. No explanation.';
  const userMsg = `Generate 15 high-value SEO search tags for this Sri Lankan e-commerce product. 

Product info:
${ctx}

Rules:
- Mix of: exact product keywords, buyer-intent phrases, long-tail variations, brand+product combos, category terms
- Include Sri Lanka / LK specific buying terms where relevant (e.g. "buy in sri lanka", "colombo delivery")
- Tags must be what real shoppers TYPE into Google/search bars
- All lowercase, no special characters except hyphens
- 1 to 4 words each — no full sentences

Reply ONLY with a JSON array of 15 strings:
["tag1","tag2","tag3","tag4","tag5","tag6","tag7","tag8","tag9","tag10","tag11","tag12","tag13","tag14","tag15"]`;

  try {
    const raw  = await callAI(systemMsg, userMsg, 600);
    console.log('[AI tags raw]', raw);
    const arr  = extractJSON(raw, 'array');
    const tags = Array.isArray(arr)
      ? arr.map(t => String(t).trim().toLowerCase().replace(/[^a-z0-9\s\-]/g, '')).filter(t => t.length > 1).slice(0, 15)
      : [];
    if (tags.length === 0) throw new Error('AI returned empty tags');
    res.json({ tags });
  } catch (err) {
    console.error('[AI /tags]', err.message);
    res.status(500).json({ message: 'AI tag suggestion failed: ' + err.message });
  }
});

/* ══════════════════════════════════════════════════════════════════
   POST /api/ai/seo  →  { metaTitle, metaDesc, focusKeyword, schema }
   Full on-page SEO package for a product
══════════════════════════════════════════════════════════════════ */
router.post('/seo', async (req, res) => {
  const { name, category, brand, description, price, salePrice, sku, tags, slug } = req.body;
  if (!name || name.trim().length < 3)
    return res.status(400).json({ message: 'Product name too short' });

  const siteUrl   = (process.env.FRONTEND_URL || 'https://storekit.local').replace(/\/$/, '');
  const productUrl = `${siteUrl}/product/${slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const descText  = String(description || '').replace(/<[^>]+>/g, '').slice(0, 300);
  const tagList   = Array.isArray(tags) ? tags.join(', ') : tags || '';

  const systemMsg = 'You are a senior SEO expert specialising in e-commerce. Output ONLY valid JSON. No markdown fences. No explanation.';
  const userMsg = `Create a complete SEO package for this product listed on a Sri Lankan online store (storekit.local).

Product details:
- Name: ${name}
- Brand: ${brand || 'unknown'}
- Category: ${category || 'General'}
- Price: Rs.${price}${salePrice ? ` (Sale: Rs.${salePrice})` : ''}
- SKU: ${sku || 'N/A'}
- Tags: ${tagList}
- Description snippet: ${descText}
- Product URL: ${productUrl}

Return ONLY this JSON (fill every field, no nulls):
{
  "metaTitle": "...",
  "metaDesc": "...",
  "focusKeyword": "...",
  "secondaryKeywords": ["...", "..."],
  "schema": {}
}

Rules:
- metaTitle: 50–60 chars, include main keyword + brand if space allows + "| StoreKit" suffix
- metaDesc: 140–160 chars, include focus keyword naturally, mention Sri Lanka / fast delivery, add a call to action
- focusKeyword: the single best keyword a shopper would use to find this exact product
- secondaryKeywords: 5 related long-tail keyword phrases (what people also search)
- schema: complete JSON-LD Product schema object (type Product) with name, description, brand, offers (price, priceCurrency LKR, availability, url), image placeholder "IMAGE_URL", sku`;

  try {
    const raw    = await callAI(systemMsg, userMsg, 1200);
    console.log('[AI seo raw]', raw);
    const parsed = extractJSON(raw, 'object');

    // Validate and sanitize
    const result = {
      metaTitle:         (parsed.metaTitle         || `${name} | StoreKit`).slice(0, 70),
      metaDesc:          (parsed.metaDesc           || '').slice(0, 165),
      focusKeyword:      (parsed.focusKeyword       || name).toLowerCase(),
      secondaryKeywords: Array.isArray(parsed.secondaryKeywords) ? parsed.secondaryKeywords.slice(0, 5) : [],
      schema:            parsed.schema              || {},
    };

    res.json(result);
  } catch (err) {
    console.error('[AI /seo]', err.message);
    res.status(500).json({ message: 'AI SEO generation failed: ' + err.message });
  }
});

/* ══════════════════════════════════════════════════════════════════
   POST /api/ai/description  →  { description: "<html>..." }
   Full long-form product description in the fixed marketing format:
   Title line, intro paragraph, "Key Features" bullets, "Product
   Description" paragraphs (with related-search keywords woven in),
   "Ideal For" bullets, closing line. Returned as ready-to-use HTML
   for the rich-text editor.
══════════════════════════════════════════════════════════════════ */
router.post('/description', async (req, res) => {
  const { name, category, brand, sku, price, salePrice, shortDescription, tags } = req.body;
  if (!name || name.trim().length < 3)
    return res.status(400).json({ message: 'Product name too short' });

  const ctxLines = [
    brand            && `Brand: ${brand}`,
    category         && `Category: ${category}`,
    sku              && `Model / SKU: ${sku}`,
    price            && `Price: Rs.${price}${salePrice ? ` (sale Rs.${salePrice})` : ''}`,
    shortDescription && `Short description: ${shortDescription}`,
    tags             && `Existing tags/keywords: ${Array.isArray(tags) ? tags.join(', ') : tags}`,
  ].filter(Boolean).join('\n');

  const systemMsg = 'You are an expert e-commerce copywriter for a Sri Lankan online store. You output ONLY valid HTML for a product description. No markdown, no code fences, no explanation, no <html>/<body> wrapper — just the inner HTML fragment.';

  const userMsg = [
    `Write a long-form product description for "${name.trim()}" for storekit.local.`,
    ctxLines ? `\nProduct context:\n${ctxLines}` : '',
    ``,
    `Return ONLY an HTML fragment using EXACTLY this structure and tags (fill in real content, keep the section order and headings):`,
    ``,
    `<h3>{Catchy SEO title for the product, ~60-90 chars, may include the product/model name}</h3>`,
    `<p>{1-2 sentence intro paragraph describing what the product is and its main benefit/technology}</p>`,
    `<h4 style="margin-top:1.25em;margin-bottom:0.5em;">Key Features</h4>`,
    `<ul>`,
    `<li>{feature 1}</li>`,
    `<li>{feature 2}</li>`,
    `... (8-10 short feature bullets total, each 3-8 words)`,
    `</ul>`,
    `<h4 style="margin-top:1.25em;margin-bottom:0.5em;">Product Description</h4>`,
    `<p>{paragraph 1: 2-3 sentences expanding on the product's purpose and what kind of buyer it suits}</p>`,
    `<p>{paragraph 2: 1-2 sentences that naturally weave in 5-8 related search terms a shopper might type, phrased like "This product is perfect for customers searching for X, Y, Z, ..."}</p>`,
    `<p>{paragraph 3: 1-2 sentences about ideal usage settings (home/office/etc) and the overall value proposition}</p>`,
    `<h4 style="margin-top:1.25em;margin-bottom:0.5em;">Ideal For</h4>`,
    `<ul>`,
    `<li>{use case 1}</li>`,
    `<li>{use case 2}</li>`,
    `... (4-6 short "ideal for" bullets total, each 2-6 words)`,
    `</ul>`,
    `<p>{1 short closing sentence that reinforces the key benefit and ends with the product name}</p>`,
    ``,
    `Rules:`,
    `- Plain factual marketing tone, no emojis, no asterisks, no markdown.`,
    `- Use EXACTLY these h4 tags with their style attributes as shown above — do not change or omit the style attribute.`,
    `- Use the exact tag names <h3>, <p>, <h4>, <ul>, <li> only — no extra attributes, classes, or wrapper divs except the style on h4.`,
    `- Do not invent specific technical specs that weren't provided — keep features plausible and generic to the product type if details are missing.`,
    `- Output must start with <h3> and contain nothing before or after the HTML fragment.`,
  ].filter(s => s !== undefined).join('\n');

  try {
    let html = await callAI(systemMsg, userMsg, 1200);

    // Strip accidental code fences / wrappers if the model adds them
    html = html.trim()
      .replace(/^```(?:html)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    const start = html.indexOf('<h3');
    if (start === -1) throw new Error('AI did not return expected HTML structure');
    html = html.slice(start).trim();

    res.json({ description: html });
  } catch (err) {
    console.error('[AI /description]', err.message);
    res.status(500).json({ message: 'AI description generation failed: ' + err.message });
  }
});

/* ══════════════════════════════════════════════════════════════════
   GET /api/ai/status
══════════════════════════════════════════════════════════════════ */
router.get('/status', (req, res) => {
  if (process.env.OPENROUTER_API_KEY) return res.json({ provider: 'openrouter', status: 'ok' });
  if (process.env.GEMINI_API_KEY)     return res.json({ provider: 'gemini',     status: 'ok' });
  res.status(500).json({ provider: 'none', status: 'error' });
});

/* ══════════════════════════════════════════════════════════════════
   POST /api/ai/specs  →  { specs: [{ key, value }] }
   Generates a full product specifications table in the same format
   as the SpecsPanel — ordered rows of { key, value } pairs covering
   brand, model, connectivity, dimensions, safety, warranty, etc.
══════════════════════════════════════════════════════════════════ */
router.post('/specs', async (req, res) => {
  const { name, category, brand, sku, price, salePrice, description } = req.body;
  if (!name || name.trim().length < 3)
    return res.status(400).json({ message: 'Product name too short' });

  const ctxLines = [
    brand       && `Brand: ${brand}`,
    category    && `Category: ${category}`,
    sku         && `Model / SKU: ${sku}`,
    price       && `Price: Rs.${price}${salePrice ? ` (sale Rs.${salePrice})` : ''}`,
    description && `Description snippet: ${String(description).replace(/<[^>]+>/g, '').slice(0, 300)}`,
  ].filter(Boolean).join('\n');

  const systemMsg = 'You are an expert e-commerce product data specialist. You output ONLY valid JSON arrays. No markdown, no code fences, no explanation.';

  const userMsg = [
    `Generate a complete product specifications table for "${name.trim()}" on storekit.local.`,
    ctxLines ? `\nProduct context:\n${ctxLines}` : '',
    ``,
    `Reply ONLY with a JSON array of objects, each with "key" and "value" string fields, nothing else.`,
    `Example format:`,
    `[{"key":"Brand","value":"UGREEN"},{"key":"Model","value":"W707"},{"key":"Charging Standard","value":"Qi2 Certified"}]`,
    ``,
    `SPEC RULES:`,
    `- Always start with: Brand, Model (if known), Part Number / SKU (if known), Product Type`,
    `- Include all relevant technical specifications appropriate for this product category`,
    `- For CHARGERS/POWER: include Charging Standard, Output Power (per port), Input Interface, Cable Length/Type, Certifications, Safety Features, Compatibility`,
    `- For SMARTPHONES: include Display, Processor, RAM, Storage, Battery, Camera, OS, Connectivity, Dimensions, Weight`,
    `- For AUDIO: include Driver Size, Frequency Response, Impedance, Connectivity, Battery Life, Codec Support, Noise Cancellation`,
    `- For LAPTOPS/COMPUTERS: include Processor, RAM, Storage, Display, GPU, OS, Ports, Battery, Weight`,
    `- For ACCESSORIES: include Material, Compatibility, Dimensions/Size, Color, Certifications`,
    `- Always end with: Color (if applicable), Certifications (if applicable), Warranty`,
    `- Use factual spec names (e.g. "Phone Charging Output" not "Output") — be specific and professional`,
    `- Values must be concise but complete (e.g. "Up to 15W" not just "15W"; "Overcharge, Overcurrent, Overheat Protection" not "Yes")`,
    `- Include 12–25 spec rows depending on product complexity`,
    `- Do NOT invent specific model numbers or certifications not inferable from the product name — use generic accurate values`,
    `- Do NOT include price, availability, or shipping info`,
  ].filter(s => s !== undefined).join('\n');

  try {
    const raw    = await callAI(systemMsg, userMsg, 1200);
    const parsed = extractJSON(raw, 'array');

    // Validate and clean: must be array of { key, value }
    const specs = parsed
      .filter(item => item && typeof item.key === 'string' && typeof item.value === 'string')
      .map(item => ({ key: item.key.trim(), value: item.value.trim() }))
      .filter(item => item.key && item.value);

    if (specs.length === 0) throw new Error('AI returned no valid specs');

    res.json({ specs });
  } catch (err) {
    console.error('[AI /specs]', err.message);
    res.status(500).json({ message: 'AI spec generation failed: ' + err.message });
  }
});


/* ── generateProductDescription — exported helper for scrape.js ──────────────
 * Generates a fully formatted HTML product description using the same
 * AI prompt as POST /api/ai/description, but callable directly from
 * other backend modules without going through HTTP.
 *
 * Usage in scrape.js:
 *   const { generateProductDescription } = require('./ai');
 *   const html = await generateProductDescription({ name, brand, sku, price });
 * ─────────────────────────────────────────────────────────────────────────── */
async function generateProductDescription({ name = '', category = '', brand = '', sku = '', price = '', salePrice = '', shortDescription = '', tags = [] } = {}) {
  if (!name || name.trim().length < 3) throw new Error('Product name too short');

  // Auto-generate brand if not provided — extract it from product name via AI
  if (!brand) {
    try {
      const brandSystemMsg = 'You are an expert e-commerce product data assistant. You output ONLY valid JSON. No markdown. No explanation.';
      const brandUserMsg = `Extract the manufacturer brand name from this product name: "${name.trim()}"\n\nReply ONLY with this JSON: {"brand":"BRAND_HERE"}\n\nRules:\n- BRAND_HERE must be the manufacturer/brand name extracted from the product name\n- Use empty string "" only if genuinely impossible to determine\n- Do NOT include model numbers, series names, or descriptive words — only the brand`;
      const brandRaw = await callAI(brandSystemMsg, brandUserMsg, 100);
      const brandParsed = extractJSON(brandRaw, 'object');
      brand = (brandParsed.brand || '').trim();
    } catch (_) {
      // Brand extraction is non-fatal — continue without it
    }
  }

  const ctxLines = [
    brand            && `Brand: ${brand}`,
    category         && `Category: ${category}`,
    sku              && `Model / SKU: ${sku}`,
    price            && `Price: Rs.${price}${salePrice ? ` (sale Rs.${salePrice})` : ''}`,
    shortDescription && `Short description: ${shortDescription}`,
    tags && tags.length && `Existing tags/keywords: ${Array.isArray(tags) ? tags.join(', ') : tags}`,
  ].filter(Boolean).join('\n');

  const systemMsg = 'You are an expert e-commerce copywriter for a Sri Lankan online store. You output ONLY valid HTML for a product description. No markdown, no code fences, no explanation, no <html>/<body> wrapper — just the inner HTML fragment.';

  const userMsg = [
    `Write a long-form product description for "${name.trim()}" for storekit.local.`,
    ctxLines ? `\nProduct context:\n${ctxLines}` : '',
    '',
    'Return ONLY an HTML fragment using EXACTLY this structure and tags (fill in real content, keep the section order and headings):',
    '',
    '<h3>{Catchy SEO title for the product, ~60-90 chars, may include the product/model name}</h3>',
    '<p>{1-2 sentence intro paragraph describing what the product is and its main benefit/technology}</p>',
    '<h4 style="margin-top:1.25em;margin-bottom:0.5em;">Key Features</h4>',
    '<ul>',
    '<li>{feature 1}</li>',
    '<li>{feature 2}</li>',
    '... (8-10 short feature bullets total, each 3-8 words)',
    '</ul>',
    '<h4 style="margin-top:1.25em;margin-bottom:0.5em;">Product Description</h4>',
    '<p>{paragraph 1: 2-3 sentences expanding on the product\'s purpose and what kind of buyer it suits}</p>',
    '<p>{paragraph 2: 1-2 sentences that naturally weave in 5-8 related search terms a shopper might type, phrased like "This product is perfect for customers searching for X, Y, Z, ..."}</p>',
    '<p>{paragraph 3: 1-2 sentences about ideal usage settings (home/office/etc) and the overall value proposition}</p>',
    '<h4 style="margin-top:1.25em;margin-bottom:0.5em;">Ideal For</h4>',
    '<ul>',
    '<li>{use case 1}</li>',
    '<li>{use case 2}</li>',
    '... (4-6 short "ideal for" bullets total, each 2-6 words)',
    '</ul>',
    '<p>{1 short closing sentence that reinforces the key benefit and ends with the product name}</p>',
    '',
    'Rules:',
    '- Plain factual marketing tone, no emojis, no asterisks, no markdown.',
    '- Use EXACTLY these h4 tags with their style attributes as shown above — do not change or omit the style attribute.',
    '- Use the exact tag names <h3>, <p>, <h4>, <ul>, <li> only — no extra attributes, classes, or wrapper divs except the style on h4.',
    '- Do not invent specific technical specs that were not provided — keep features plausible and generic to the product type if details are missing.',
    '- Output must start with <h3> and contain nothing before or after the HTML fragment.',
  ].filter(s => s !== undefined).join('\n');

  let html = await callAI(systemMsg, userMsg, 1200);

  // Strip accidental code fences the model may add
  html = html.trim()
    .replace(/^```(?:html)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  const start = html.indexOf('<h3');
  if (start === -1) throw new Error('AI did not return expected HTML structure');
  return html.slice(start).trim();
}

/* ── generateProductSpecs — exported helper for scrape.js ───────────────────
 * Generates a specifications array [{ key, value }] using the same AI prompt
 * as POST /api/ai/specs, callable directly from other backend modules.
 *
 * Usage in scrape.js:
 *   const { generateProductSpecs } = require('./ai');
 *   const specs = await generateProductSpecs({ name, brand, sku, category });
 * ─────────────────────────────────────────────────────────────────────────── */
async function generateProductSpecs({ name = '', category = '', brand = '', sku = '', price = '', salePrice = '', description = '' } = {}) {
  if (!name || name.trim().length < 3) throw new Error('Product name too short');

  const ctxLines = [
    brand       && `Brand: ${brand}`,
    category    && `Category: ${category}`,
    sku         && `Model / SKU: ${sku}`,
    price       && `Price: Rs.${price}${salePrice ? ` (sale Rs.${salePrice})` : ''}`,
    description && `Description snippet: ${String(description).replace(/<[^>]+>/g, '').slice(0, 300)}`,
  ].filter(Boolean).join('\n');

  const systemMsg = 'You are an expert e-commerce product data specialist. You output ONLY valid JSON arrays. No markdown, no code fences, no explanation.';

  const userMsg = [
    `Generate a complete product specifications table for "${name.trim()}" on storekit.local.`,
    ctxLines ? `\nProduct context:\n${ctxLines}` : '',
    '',
    'Reply ONLY with a JSON array of objects, each with "key" and "value" string fields, nothing else.',
    'Example format:',
    '[{"key":"Brand","value":"UGREEN"},{"key":"Model","value":"W707"},{"key":"Charging Standard","value":"Qi2 Certified"}]',
    '',
    'SPEC RULES:',
    '- Always start with: Brand, Model (if known), Part Number / SKU (if known), Product Type',
    '- Include all relevant technical specifications appropriate for this product category',
    '- For CHARGERS/POWER: include Charging Standard, Output Power (per port), Input Interface, Cable Length/Type, Certifications, Safety Features, Compatibility',
    '- For SMARTPHONES: include Display, Processor, RAM, Storage, Battery, Camera, OS, Connectivity, Dimensions, Weight',
    '- For AUDIO: include Driver Size, Frequency Response, Impedance, Connectivity, Battery Life, Codec Support, Noise Cancellation',
    '- For LAPTOPS/COMPUTERS: include Processor, RAM, Storage, Display, GPU, OS, Ports, Battery, Weight',
    '- For ACCESSORIES: include Material, Compatibility, Dimensions/Size, Color, Certifications',
    '- Always end with: Color (if applicable), Certifications (if applicable), Warranty',
    '- Use factual spec names (e.g. "Phone Charging Output" not "Output") — be specific and professional',
    '- Values must be concise but complete (e.g. "Up to 15W" not just "15W"; "Overcharge, Overcurrent, Overheat Protection" not "Yes")',
    '- Include 12–25 spec rows depending on product complexity',
    '- Do NOT invent specific model numbers or certifications not inferable from the product name — use generic accurate values',
    '- Do NOT include price, availability, or shipping info',
  ].filter(s => s !== undefined).join('\n');

  const raw    = await callAI(systemMsg, userMsg, 1200);
  const parsed = extractJSON(raw, 'array');

  const specs = parsed
    .filter(item => item && typeof item.key === 'string' && typeof item.value === 'string')
    .map(item => ({ key: item.key.trim(), value: item.value.trim() }))
    .filter(item => item.key && item.value);

  if (specs.length === 0) throw new Error('AI returned no valid specs');
  return specs;
}

/* ── generateBrand — exported helper for scrape.js ──────────────────────────
 * Extracts the manufacturer brand from a product name using AI.
 * Returns a string (empty string if not determinable).
 * ─────────────────────────────────────────────────────────────────────────── */
async function generateBrand(name = '') {
  if (!name || name.trim().length < 3) return '';
  try {
    const systemMsg = 'You are an expert e-commerce product data assistant. You output ONLY valid JSON. No markdown. No explanation.';
    const userMsg = `Extract the manufacturer brand name from this product name: "${name.trim()}"\n\nReply ONLY with this JSON: {"brand":"BRAND_HERE"}\n\nRules:\n- BRAND_HERE must be the manufacturer/brand name extracted from the product name\n- Use empty string "" only if genuinely impossible to determine\n- Do NOT include model numbers, series names, or descriptive words — only the brand`;
    const raw    = await callAI(systemMsg, userMsg, 100);
    const parsed = extractJSON(raw, 'object');
    return (parsed.brand || '').trim();
  } catch (_) {
    return '';
  }
}

/* ── generateShortDescription — exported helper for scrape.js ────────────────
 * Generates a 110-155 char SEO-optimised short description using the same
 * prompt rules as the /api/ai/autofill endpoint.
 * Returns a string (empty string if AI unavailable).
 * ─────────────────────────────────────────────────────────────────────────── */
async function generateShortDescription({ name = '', brand = '', category = '', price = '', salePrice = '' } = {}) {
  if (!name || name.trim().length < 3) return '';
  try {
    const ctxLines = [
      brand    && `Brand: ${brand}`,
      category && `Category: ${category}`,
      price    && `Price: Rs.${price}${salePrice ? ` (sale Rs.${salePrice})` : ''}`,
    ].filter(Boolean).join('\n');

    const systemMsg = 'You are an expert e-commerce SEO copywriter for a Sri Lankan online store. You output ONLY valid JSON. No markdown. No explanation.';

    const userMsg = [
      `Generate autofill fields for this product on storekit.local (Sri Lanka e-commerce).`,
      ``,
      `Product name: "${name.trim()}"`,
      ctxLines ? `Context:\n${ctxLines}` : '',
      ``,
      `Reply ONLY with this JSON, nothing else:`,
      `{"brand":"BRAND_HERE","shortDescription":"DESC_HERE"}`,
      ``,
      `BRAND_HERE rules:`,
      `- The manufacturer/brand name (extract from product name or context)`,
      `- Empty string "" if genuinely unknown`,
      ``,
      `DESC_HERE rules — this appears directly in Google search results:`,
      `- Length: 110-155 characters EXACTLY`,
      `- Open with the key feature or benefit — NOT the product name`,
      `- Include ONE buying-intent phrase: "buy online in Sri Lanka", "best price in Sri Lanka", or "fast delivery across Sri Lanka"`,
      `- Mention a real spec or use-case that differentiates this product`,
      `- End with: "Fast delivery across Sri Lanka." or "Order now at StoreKit."`,
      `- Plain English only — no markdown, no asterisks, no ALL CAPS, no emoji`,
      `- Do NOT open with the brand name or product name`,
      `- Do NOT use vague filler like "high quality", "perfect for everyone"`,
      ``,
      `GOOD example for "Sony XV800 X-Series Wireless Party Speaker":`,
      `"Powerful 360-degree party sound with built-in mic input, LED lighting and IPX4 splash-proof body. Buy the Sony XV800 online with fast delivery across Sri Lanka."`,
      ``,
      `BAD example (too short, generic, no Sri Lanka signal):`,
      `"Wireless party speaker with great sound quality."`,
    ].filter(s => s !== undefined).join('\n');

    const raw    = await callAI(systemMsg, userMsg, 500);
    const parsed = extractJSON(raw, 'object');
    const sd     = (parsed.shortDescription || '').trim();
    if (sd.length < 50) {
      console.warn('[AI generateShortDescription] too short (' + sd.length + ' chars):', sd);
    }
    return sd;
  } catch (err) {
    console.warn('[AI generateShortDescription] skipped:', err.message);
    return '';
  }
}

module.exports = router;
module.exports.generateProductDescription = generateProductDescription;
module.exports.generateProductSpecs       = generateProductSpecs;
module.exports.generateShortDescription   = generateShortDescription;
module.exports.generateBrand              = generateBrand;