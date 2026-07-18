/**
 * routes/products.js  — with automation hooks + Excel export + IMAGE NORMALIZATION
 *
 *   POST /       → fires 'new_product'      trigger after product create
 *   PUT  /:id    → fires 'product_discount' trigger when salePrice is set/changed
 *   GET  /admin/export/excel → streams a full product list as .xlsx
 * 
 *   NEW: All routes that return products now include image URL normalization middleware
 */
const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const Product = require('../models/Product');
const Tenant = require('../models/Tenant');
const { Category } = require('../models/index');
const { adminAuth } = require('../middleware/auth');
const { dispatchForTrigger, manualPublish } = require('../services/publisherService');
const { normalizeProductValue, duplicateKeyError, duplicateKeyLabel } = require('../utils/productDuplicates');
const { isValidGtin } = require('../utils/productSeo');

// ─── IMAGE URL NORMALIZATION MIDDLEWARE ─────────────────────────────────────
const { normalizeImageUrl, normalizeImagesMiddleware } = require('../utils/imageUrlHelper');

// In-memory upload for bulk-import excel files (not saved to disk)
const bulkUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function tenantIdForWrite(req) {
  return req.user?.tenantId || req.tenantId || null;
}

function requireTenantForAdmin(req, res) {
  const tenantId = tenantIdForWrite(req);
  if (!tenantId) {
    res.status(400).json({ message: 'Tenant not resolved. Open admin through the tenant store domain or re-login.' });
    return null;
  }
  return tenantId;
}

function slugify(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'product';
}

function normalizeMerchantFields(body = {}) {
  const next = body;
  if (Object.prototype.hasOwnProperty.call(next, 'gtin')) {
    next.gtin = String(next.gtin || '').replace(/\D/g, '');
    if (next.gtin && !isValidGtin(next.gtin)) {
      const error = new Error('GTIN must be a valid 8, 12, 13, or 14 digit code with the correct check digit');
      error.statusCode = 400;
      throw error;
    }
  }
  if (Object.prototype.hasOwnProperty.call(next, 'mpn')) next.mpn = String(next.mpn || '').trim();
  if (Object.prototype.hasOwnProperty.call(next, 'googleProductCategory')) next.googleProductCategory = String(next.googleProductCategory || '').trim();
  if (next.condition && !['new', 'refurbished', 'used'].includes(next.condition)) {
    const error = new Error('Product condition must be new, refurbished, or used');
    error.statusCode = 400;
    throw error;
  }
  if (next.identifierExists === false && (next.gtin || next.mpn)) {
    const error = new Error('Remove the GTIN/MPN before selecting “no manufacturer identifiers”');
    error.statusCode = 400;
    throw error;
  }
  return next;
}

function validateActiveProduct(product = {}) {
  if (product.isActive === false) return;
  const error = message => {
    const validationError = new Error(message);
    validationError.statusCode = 400;
    throw validationError;
  };
  if (!String(product.name || '').trim()) error('Active products require a name');
  if (!String(product.description || '').replace(/<[^>]*>/g, ' ').trim()) error('Active products require a description for Google');
  if (!(Number(product.price) > 0)) error('Active products require a price greater than zero');
  if (!Number.isFinite(Number(product.stock)) || Number(product.stock) < 0) error('Stock must be zero or greater');
  if (!product.category) error('Active products require a category');
  const image = String(product.thumbnail || product.images?.[0] || '').trim();
  if (!image) error('Active products require a product image before they can be shown to Google');
  if (!/^https:\/\//i.test(image) && !image.startsWith('/')) error('The main product image must use HTTPS or a store-relative URL');
  if (/\.svg(?:$|[?#])/i.test(image)) error('Use a JPG, PNG, WebP, GIF, BMP, or TIFF product image; Google Merchant does not accept SVG product images');
  const explicitExtension = image.split(/[?#]/)[0].match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
  if (explicitExtension && !/^(?:jpe?g|webp|png|gif|bmp|tiff?)$/i.test(explicitExtension)) {
    error('The main Merchant image must be JPG, PNG, WebP, GIF, BMP, or TIFF; AVIF and SVG are not supported');
  }
  if (!product.gtin && !product.mpn && product.identifierExists !== false) {
    error('Add a GTIN or MPN, or confirm that this product has no manufacturer identifiers');
  }
  if (product.mpn && !String(product.brand || '').trim()) error('Add the manufacturer brand when supplying an MPN');
  const salePrice = Number(product.salePrice);
  if (product.isOnSale && (!(salePrice > 0) || salePrice >= Number(product.price))) {
    error('On Sale products require a sale price greater than zero and lower than the regular price');
  }
}

async function makeUniqueProductSlug(nameOrSlug, tenantId, excludeId = null) {
  const base = slugify(nameOrSlug).slice(0, 80).replace(/-$/, '') || 'product';
  let slug = base;
  let i = 2;
  // eslint-disable-next-line no-await-in-loop
  while (await Product.exists({ tenantId, slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) })) {
    slug = `${base}-${i}`;
    i += 1;
  }
  return slug;
}

async function assertProductLimit(tenantId, extraCount = 1) {
  const tenant = await Tenant.findById(tenantId).populate('plan', 'limits name');
  const limit = Number(tenant?.plan?.limits?.products || 0);
  if (!limit) return;
  const current = await Product.countDocuments({ tenantId });
  if (current + extraCount > limit) {
    const err = new Error(`Product limit reached for ${tenant.plan.name}. Limit: ${limit}`);
    err.statusCode = 403;
    throw err;
  }
}

async function findProductDuplicate(tenantId, name, sku, excludeId = null) {
  const normalizedName = normalizeProductValue(name);
  const normalizedSku = normalizeProductValue(sku);
  const clauses = [];
  if (normalizedName) clauses.push({ $expr: { $eq: [{ $toLower: { $trim: { input: { $ifNull: ['$name', ''] } } } }, normalizedName] } });
  if (normalizedSku) clauses.push({ $expr: { $eq: [{ $toLower: { $trim: { input: { $ifNull: ['$sku', ''] } } } }, normalizedSku] } });
  if (!clauses.length) return null;
  return Product.findOne({ tenantId, ...(excludeId ? { _id: { $ne: excludeId } } : {}), $or: clauses })
    .select('name sku').lean();
}

function duplicateConflict(res, existing, requestedName, requestedSku) {
  const sameSku = normalizeProductValue(requestedSku) && normalizeProductValue(existing?.sku) === normalizeProductValue(requestedSku);
  return res.status(409).json({
    message: `Duplicate product ${sameSku ? 'SKU' : 'name'}. Existing product: ${existing?.name || requestedName}`,
    code: sameSku ? 'DUPLICATE_PRODUCT_SKU' : 'DUPLICATE_PRODUCT_NAME',
    existingProduct: existing ? { id: existing._id, name: existing.name, sku: existing.sku || '' } : undefined,
  });
}

async function tenantDuplicateMap(tenantId) {
  const rows = await Product.aggregate([
    { $match: { tenantId } },
    { $project: { name: 1, sku: 1,
      normalizedName: { $toLower: { $trim: { input: { $ifNull: ['$name', ''] } } } },
      normalizedSku: { $toLower: { $trim: { input: { $ifNull: ['$sku', ''] } } } },
    } },
    { $facet: {
      names: [{ $match: { normalizedName: { $ne: '' } } }, { $group: { _id: '$normalizedName', ids: { $push: '$_id' }, count: { $sum: 1 }, value: { $first: '$name' } } }, { $match: { count: { $gt: 1 } } }],
      skus: [{ $match: { normalizedSku: { $ne: '' } } }, { $group: { _id: '$normalizedSku', ids: { $push: '$_id' }, count: { $sum: 1 }, value: { $first: '$sku' } } }, { $match: { count: { $gt: 1 } } }],
    } },
  ]);
  const map = new Map();
  const groups = [];
  for (const [kind, entries] of Object.entries({ name: rows[0]?.names || [], sku: rows[0]?.skus || [] })) {
    entries.forEach(entry => {
      groups.push({ kind, value: entry.value, count: entry.count });
      entry.ids.forEach(id => {
        const key = id.toString();
        const current = map.get(key) || { count: 0, fields: [] };
        current.count += entry.count - 1;
        current.fields.push({ kind, value: entry.value, count: entry.count });
        map.set(key, current);
      });
    });
  }
  return { map, groups };
}


// ── IMPORTANT: named routes BEFORE /:slug wildcard ───────────────────────────

// Admin — export all products as Excel
router.get('/admin/export/excel', adminAuth, async (req, res) => {
  try {
    // Lazy-require so exceljs is only loaded when this route is hit
    const ExcelJS = require('exceljs');

    const tenantId = requireTenantForAdmin(req, res);
    if (!tenantId) return;

    const products = await Product.find({ tenantId })
      .populate('category', 'name')
      .sort({ createdAt: -1 })
      .lean();

    const wb = new ExcelJS.Workbook();
    wb.creator = 'StoreKit';
    wb.created = new Date();

    const ws = wb.addWorksheet('Products', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    // ── Column definitions ──────────────────────────────────────────────────
    ws.columns = [
      { header: 'Name',             key: 'name',             width: 35 },
      { header: 'SKU',              key: 'sku',              width: 18 },
      { header: 'Category',         key: 'category',         width: 20 },
      { header: 'Sub-Category',     key: 'subCategory',      width: 20 },
      { header: 'Brand',            key: 'brand',            width: 18 },
      { header: 'Price (Rs.)',       key: 'price',            width: 14 },
      { header: 'Sale Price (Rs.)',  key: 'salePrice',        width: 16 },
      { header: 'Cost Price (Rs.)',  key: 'costPrice',        width: 16 },
      { header: 'Stock',            key: 'stock',            width: 10 },
      { header: 'Low Stock Alert',  key: 'lowStockThreshold',width: 16 },
      { header: 'Weight (g)',        key: 'weight',           width: 12 },
      { header: 'Status',           key: 'status',           width: 12 },
      { header: 'Featured',         key: 'isFeatured',       width: 11 },
      { header: 'On Sale',          key: 'isOnSale',         width: 11 },
      { header: 'Rating (avg)',      key: 'ratingAvg',        width: 13 },
      { header: 'Rating (count)',    key: 'ratingCount',      width: 14 },
      { header: 'Views',            key: 'views',            width: 10 },
      { header: 'Sold Count',       key: 'soldCount',        width: 12 },
      { header: 'Tags',             key: 'tags',             width: 35 },
      { header: 'Short Description',key: 'shortDescription', width: 50 },
      { header: 'Thumbnail URL',    key: 'thumbnail',        width: 60 },
      { header: 'Image 1',          key: 'image1',           width: 60 },
      { header: 'Image 2',          key: 'image2',           width: 60 },
      { header: 'Image 3',          key: 'image3',           width: 60 },
      { header: 'Image 4',          key: 'image4',           width: 60 },
      { header: 'Image 5',          key: 'image5',           width: 60 },
      { header: 'Specifications',   key: 'specifications',   width: 60 },
      { header: 'Variants',         key: 'variants',         width: 40 },
      { header: 'Slug',             key: 'slug',             width: 40 },
      { header: 'Created At',       key: 'createdAt',        width: 20 },
    ];

    // ── Header row styling ──────────────────────────────────────────────────
    const headerRow = ws.getRow(1);
    headerRow.eachCell(cell => {
      cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Arial', size: 10 };
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border    = {
        bottom: { style: 'thin', color: { argb: 'FF334155' } },
      };
    });
    headerRow.height = 30;

    // ── Colour helpers ──────────────────────────────────────────────────────
    const ROW_EVEN    = 'FFF8FAFC';
    const ROW_ODD     = 'FFFFFFFF';
    const GREEN_BG    = 'FFD1FAE5';
    const RED_BG      = 'FFFEE2E2';
    const AMBER_BG    = 'FFFEF3C7';
    const BLUE_TEXT   = 'FF2563EB';

    // ── Data rows ──────────────────────────────────────────────────────────
    products.forEach((p, idx) => {
      const images = Array.isArray(p.images) ? p.images : [];

      const specsText = Array.isArray(p.specifications) && p.specifications.length
        ? p.specifications.map(s => `${s.key}: ${s.value}`).join(' | ')
        : '';

      const variantsText = Array.isArray(p.variants) && p.variants.length
        ? p.variants.map(v => {
            const vals = (v.values || []).map(vv => vv.label).join(', ');
            return `${v.name}: ${vals}`;
          }).join(' | ')
        : '';

      const row = ws.addRow({
        name:             p.name             || '',
        sku:              p.sku              || '',
        category:         p.category?.name  || '',
        subCategory:      p.subCategory     || '',
        brand:            p.brand           || '',
        price:            p.price           ?? '',
        salePrice:        p.salePrice       ?? '',
        costPrice:        p.costPrice       ?? '',
        stock:            p.stock           ?? 0,
        lowStockThreshold:p.lowStockThreshold ?? 5,
        weight:           p.weight          ?? '',
        status:           p.isActive ? 'Active' : 'Hidden',
        isFeatured:       p.isFeatured ? 'Yes' : 'No',
        isOnSale:         p.isOnSale   ? 'Yes' : 'No',
        ratingAvg:        p.ratings?.average  ?? 0,
        ratingCount:      p.ratings?.count    ?? 0,
        views:            p.views      ?? 0,
        soldCount:        p.soldCount  ?? 0,
        tags:             Array.isArray(p.tags) ? p.tags.join(', ') : '',
        shortDescription: p.shortDescription  || '',
        thumbnail:        p.thumbnail         || '',
        image1:           images[0]           || '',
        image2:           images[1]           || '',
        image3:           images[2]           || '',
        image4:           images[3]           || '',
        image5:           images[4]           || '',
        specifications:   specsText,
        variants:         variantsText,
        slug:             p.slug              || '',
        createdAt:        p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-GB') : '',
      });

      // Alternating row background
      const rowBg = idx % 2 === 0 ? ROW_EVEN : ROW_ODD;
      row.eachCell({ includeEmpty: true }, cell => {
        cell.font      = { name: 'Arial', size: 9 };
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
        cell.alignment = { vertical: 'middle', wrapText: false };
      });

      // Status cell colour
      const statusCell = row.getCell('status');
      statusCell.font = { bold: true, name: 'Arial', size: 9,
        color: { argb: p.isActive ? 'FF065F46' : 'FF92400E' } };
      statusCell.fill = { type: 'pattern', pattern: 'solid',
        fgColor: { argb: p.isActive ? GREEN_BG : AMBER_BG } };
      statusCell.alignment = { horizontal: 'center', vertical: 'middle' };

      // Stock cell colour: red if 0, amber if low
      const stockCell = row.getCell('stock');
      if (p.stock === 0) {
        stockCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED_BG } };
        stockCell.font = { bold: true, color: { argb: 'FF991B1B' }, name: 'Arial', size: 9 };
      } else if (p.stock <= (p.lowStockThreshold || 5)) {
        stockCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMBER_BG } };
        stockCell.font = { bold: true, color: { argb: 'FF92400E' }, name: 'Arial', size: 9 };
      }
      stockCell.alignment = { horizontal: 'center', vertical: 'middle' };

      // Price cells — right-aligned
      ['price', 'salePrice', 'costPrice'].forEach(k => {
        const cell = row.getCell(k);
        cell.numFmt = '#,##0';
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      });

      // URL cells — blue, clickable-looking
      ['thumbnail', 'image1', 'image2', 'image3', 'image4', 'image5'].forEach(k => {
        const cell = row.getCell(k);
        const url  = cell.value;
        if (url) {
          cell.font      = { color: { argb: BLUE_TEXT }, underline: true, name: 'Arial', size: 9 };
          // Make it a proper hyperlink
          cell.value     = { text: url, hyperlink: url };
        }
      });

      // Featured / On Sale — centre
      ['isFeatured', 'isOnSale'].forEach(k => {
        const cell = row.getCell(k);
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        if (cell.value === 'Yes') {
          cell.font = { bold: true, color: { argb: 'FF065F46' }, name: 'Arial', size: 9 };
        }
      });

      row.height = 18;
    });

    // ── Auto-filter on header row ───────────────────────────────────────────
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to:   { row: 1, column: ws.columns.length },
    };

    // ── Summary sheet ───────────────────────────────────────────────────────
    const summary = wb.addWorksheet('Summary');
    summary.columns = [
      { header: 'Metric', key: 'metric', width: 30 },
      { header: 'Value',  key: 'value',  width: 20 },
    ];

    const sHeaderRow = summary.getRow(1);
    sHeaderRow.eachCell(cell => {
      cell.font  = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Arial', size: 10 };
      cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    sHeaderRow.height = 28;

    const active   = products.filter(p => p.isActive).length;
    const hidden   = products.length - active;
    const outOfStock  = products.filter(p => p.stock === 0).length;
    const lowStock    = products.filter(p => p.stock > 0 && p.stock <= (p.lowStockThreshold || 5)).length;
    const onSale      = products.filter(p => p.isOnSale).length;
    const featured    = products.filter(p => p.isFeatured).length;
    const totalStock  = products.reduce((s, p) => s + (p.stock || 0), 0);
    const totalValue  = products.reduce((s, p) => s + ((p.costPrice || p.price || 0) * (p.stock || 0)), 0);

    const summaryData = [
      ['Total Products',       products.length],
      ['Active Products',      active],
      ['Hidden Products',      hidden],
      ['Out of Stock',         outOfStock],
      ['Low Stock',            lowStock],
      ['On Sale',              onSale],
      ['Featured',             featured],
      ['Total Units in Stock', totalStock],
      ['Inventory Value (Rs.)',totalValue],
      ['Export Date', new Date().toLocaleString('en-GB')],
    ];

    summaryData.forEach(([metric, value], i) => {
      const sRow = summary.addRow({ metric, value });
      const bg   = i % 2 === 0 ? ROW_EVEN : ROW_ODD;
      sRow.eachCell({ includeEmpty: true }, cell => {
        cell.font      = { name: 'Arial', size: 10 };
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.alignment = { vertical: 'middle' };
      });
      const valCell = sRow.getCell('value');
      if (typeof value === 'number') {
        valCell.numFmt    = '#,##0';
        valCell.alignment = { horizontal: 'right', vertical: 'middle' };
      }
      sRow.height = 20;
    });

    // ── Stream response ─────────────────────────────────────────────────────
    const filename = `storekit-products-${new Date().toISOString().slice(0,10)}.xlsx`;
    res.setHeader('Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[Excel Export]', err.message);
    res.status(500).json({ message: 'Export failed: ' + err.message });
  }
});

// Admin — download a blank/filled Excel template for bulk product upload
router.get('/admin/import-template/excel', adminAuth, async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const tenantId = requireTenantForAdmin(req, res);
    if (!tenantId) return;
    const categories = await Category.find({ tenantId, isActive: true }).sort({ name: 1 }).lean();

    const wb = new ExcelJS.Workbook();
    wb.creator = 'StoreKit';
    wb.created = new Date();

    const ws = wb.addWorksheet('Products');

    const columns = [
      { header: 'Name *',            key: 'name',             width: 32 },
      { header: 'Description *',     key: 'description',      width: 45 },
      { header: 'Short Description', key: 'shortDescription', width: 35 },
      { header: 'Category *',        key: 'category',         width: 22 },
      { header: 'Sub-Category',      key: 'subCategory',       width: 20 },
      { header: 'Brand',             key: 'brand',            width: 18 },
      { header: 'SKU',               key: 'sku',              width: 18 },
      { header: 'GTIN / Barcode',    key: 'gtin',             width: 18 },
      { header: 'MPN',               key: 'mpn',              width: 20 },
      { header: 'Condition (New/Refurbished/Used)', key: 'condition', width: 22 },
      { header: 'Google Product Category', key: 'googleProductCategory', width: 32 },
      { header: 'No Manufacturer Identifiers (Yes/No)', key: 'noIdentifiers', width: 24 },
      { header: 'Price *',           key: 'price',            width: 12 },
      { header: 'Sale Price',        key: 'salePrice',        width: 12 },
      { header: 'Cost Price',        key: 'costPrice',        width: 12 },
      { header: 'Stock',             key: 'stock',            width: 10 },
      { header: 'Low Stock Alert',   key: 'lowStockThreshold',width: 14 },
      { header: 'Weight (g)',        key: 'weight',           width: 12 },
      { header: 'Tags (comma separated)', key: 'tags',         width: 35 },
      { header: 'Thumbnail URL',     key: 'thumbnail',        width: 50 },
      { header: 'Image 1',           key: 'image1',           width: 50 },
      { header: 'Image 2',           key: 'image2',           width: 50 },
      { header: 'Image 3',           key: 'image3',           width: 50 },
      { header: 'Image 4',           key: 'image4',           width: 50 },
      { header: 'Image 5',           key: 'image5',           width: 50 },
      { header: 'Specifications (key: value | key: value)', key: 'specifications', width: 55 },
      { header: 'Status (Active/Hidden)', key: 'status',      width: 14 },
      { header: 'Featured (Yes/No)', key: 'isFeatured',       width: 14 },
    ];
    ws.columns = columns;

    const headerRow = ws.getRow(1);
    headerRow.eachCell(cell => {
      cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Arial', size: 10 };
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    });
    headerRow.height = 36;

    // Sample row — a real, fully-filled example record to copy/replace
    const sampleRow = ws.addRow({
      name: 'Classic Cotton T-Shirt',
      description: 'A premium 100% cotton t-shirt with a relaxed fit, breathable fabric, and reinforced stitching. Perfect for everyday wear in any season.',
      shortDescription: 'Soft, breathable everyday cotton tee',
      category: categories[0]?.name || 'Fashion',
      subCategory: '',
      brand: 'StoreKit Basics',
      sku: 'SZ-TSHIRT-001',
      gtin: '',
      mpn: 'TSHIRT-001',
      condition: 'New',
      googleProductCategory: 'Apparel & Accessories > Clothing > Shirts & Tops',
      noIdentifiers: 'No',
      price: 2500,
      salePrice: 1999,
      costPrice: 1200,
      stock: 100,
      lowStockThreshold: 10,
      weight: 200,
      tags: 'tshirt, cotton, casual, new',
      thumbnail: 'https://example.com/images/tshirt-thumb.jpg',
      image1: 'https://example.com/images/tshirt-front.jpg',
      image2: 'https://example.com/images/tshirt-back.jpg',
      image3: '',
      image4: '',
      image5: '',
      specifications: 'Material: 100% Cotton | Fit: Regular | Care: Machine wash cold',
      status: 'Active',
      isFeatured: 'Yes',
    });
    sampleRow.eachCell(cell => {
      cell.font = { name: 'Arial', size: 9 };
      cell.alignment = { vertical: 'middle', wrapText: false };
    });
    sampleRow.height = 18;

    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    // Reference sheet — valid category names
    const catSheet = wb.addWorksheet('Categories (reference)');
    catSheet.columns = [
      { header: 'Category Name', key: 'name', width: 30 },
      { header: 'Parent Category', key: 'parent', width: 30 },
    ];
    const catHeader = catSheet.getRow(1);
    catHeader.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Arial', size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    catHeader.height = 26;

    const byId = {};
    categories.forEach(c => { byId[c._id.toString()] = c; });
    categories.forEach(c => {
      const parent = c.parent ? byId[c.parent.toString()] : null;
      catSheet.addRow({ name: c.name, parent: parent ? parent.name : '' });
    });

    // Instructions sheet
    const info = wb.addWorksheet('Instructions');
    info.columns = [{ header: 'How to use this template', key: 'a', width: 100 }];
    info.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Arial', size: 11 };
    info.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    [
      'Fill one row per product in the "Products" sheet. Do not change column headers.',
      'Fields marked with * (Name, Description, Category, Price) are required.',
      'Category must EXACTLY match a name from the "Categories (reference)" sheet (case-insensitive).',
      'Sub-Category (optional) should match a sub-category name under the chosen category.',
      'Tags: separate multiple tags with commas, e.g. "new, summer, trending".',
      'Images: paste direct image URLs into Thumbnail URL / Image 1-5. If Thumbnail is empty, Image 1 will be used as the thumbnail.',
      'Specifications: use the format "Key: Value" and separate multiple specs with " | ", e.g. "Material: Cotton | Origin: Sri Lanka".',
      'Status: write "Active" or "Hidden" (default is Active if left empty).',
      'Featured: write "Yes" or "No" (default is No).',
      'Row 2 is a filled sample record — replace it with your own product or delete the row before uploading.',
      'Save the file and upload it via the "Bulk Upload" button on the Products page.',
    ].forEach(text => info.addRow({ a: text }));
    info.getColumn(1).alignment = { wrapText: true, vertical: 'middle' };

    const filename = `storekit-product-import-template.xlsx`;
    res.setHeader('Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[Excel Template]', err.message);
    res.status(500).json({ message: 'Template generation failed: ' + err.message });
  }
});

// Admin — bulk import products from an uploaded Excel file
// POST /api/products/admin/import/excel  (multipart/form-data, field name: "file")
router.post('/admin/import/excel', adminAuth, bulkUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const tenantId = requireTenantForAdmin(req, res);
    if (!tenantId) return;

    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(req.file.buffer);

    const ws = wb.getWorksheet('Products') || wb.worksheets[0];
    if (!ws) return res.status(400).json({ message: 'No worksheet found in file' });

    // Map headers (row 1) -> column index
    const headerMap = {};
    ws.getRow(1).eachCell((cell, colNumber) => {
      const raw = String(cell.value || '').toLowerCase().trim();
      headerMap[raw] = colNumber;
    });

    const findCol = (...names) => {
      for (const n of names) {
        const key = n.toLowerCase();
        for (const h in headerMap) {
          if (h === key || h.startsWith(key)) return headerMap[h];
        }
      }
      return null;
    };

    const colMap = {
      name:              findCol('name *', 'name'),
      description:       findCol('description *', 'description'),
      shortDescription:  findCol('short description'),
      category:          findCol('category *', 'category'),
      subCategory:       findCol('sub-category', 'sub category', 'subcategory'),
      brand:             findCol('brand'),
      sku:               findCol('sku'),
      gtin:              findCol('gtin', 'barcode'),
      mpn:               findCol('mpn'),
      condition:         findCol('condition'),
      googleProductCategory: findCol('google product category'),
      noIdentifiers:     findCol('no manufacturer identifiers', 'no identifiers'),
      price:             findCol('price *', 'price'),
      salePrice:         findCol('sale price'),
      costPrice:         findCol('cost price'),
      stock:             findCol('stock'),
      lowStockThreshold: findCol('low stock'),
      weight:            findCol('weight'),
      tags:              findCol('tags'),
      thumbnail:         findCol('thumbnail'),
      image1:            findCol('image 1', 'image1'),
      image2:            findCol('image 2', 'image2'),
      image3:            findCol('image 3', 'image3'),
      image4:            findCol('image 4', 'image4'),
      image5:            findCol('image 5', 'image5'),
      specifications:    findCol('specifications'),
      status:            findCol('status'),
      isFeatured:        findCol('featured'),
    };

    if (!colMap.name || !colMap.description || !colMap.category || !colMap.price) {
      return res.status(400).json({
        message: 'Invalid template: missing required columns (Name, Description, Category, Price). Please use the provided template.'
      });
    }

    // Build a lookup of categories by lowercase name (and optionally scoped by parent)
    const allCategories = await Category.find({ tenantId }).lean();
    const catByNameAndParent = {}; // key: `${lowerName}|${parentId||''}`
    const catByName = {};          // key: lowerName -> first match
    allCategories.forEach(c => {
      const lname = (c.name || '').toLowerCase().trim();
      const pkey  = c.parent ? c.parent.toString() : '';
      catByNameAndParent[`${lname}|${pkey}`] = c;
      if (!catByName[lname]) catByName[lname] = c;
    });

    const cell = (row, col) => {
      if (!col) return '';
      const v = row.getCell(col).value;
      if (v == null) return '';
      if (typeof v === 'object') {
        if (v.text != null) return String(v.text).trim();      // hyperlink object
        if (v.richText) return v.richText.map(t => t.text).join('').trim();
        if (v.result != null) return String(v.result).trim();   // formula result
        return String(v).trim();
      }
      return String(v).trim();
    };
    const num = (row, col) => {
      const v = cell(row, col);
      if (v === '') return undefined;
      const n = Number(v);
      return Number.isNaN(n) ? undefined : n;
    };

    const rowCount = ws.rowCount;
    let incomingProducts = 0;
    for (let r = 2; r <= rowCount; r++) {
      if (cell(ws.getRow(r), colMap.name)) incomingProducts++;
    }
    await assertProductLimit(tenantId, incomingProducts);

    const results = { created: 0, skipped: 0, errors: [] };

    for (let r = 2; r <= rowCount; r++) {
      const row = ws.getRow(r);
      const name = cell(row, colMap.name);
      if (!name) continue; // skip empty rows (e.g. the example row if left blank)

      try {
        const description = cell(row, colMap.description);
        const priceVal     = num(row, colMap.price);
        const categoryName = cell(row, colMap.category);
        const subCatName   = cell(row, colMap.subCategory);

        if (!description) throw new Error('Description is required');
        if (priceVal == null) throw new Error('Price is required and must be a number');
        if (!categoryName) throw new Error('Category is required');

        // Resolve category — prefer subcategory match (scoped under main category), else the main category itself
        let categoryDoc = null;
        const mainLower = categoryName.toLowerCase().trim();
        const mainMatch = catByName[mainLower];
        if (!mainMatch) throw new Error(`Category "${categoryName}" not found`);

        if (subCatName) {
          const subLower = subCatName.toLowerCase().trim();
          const subMatch = catByNameAndParent[`${subLower}|${mainMatch._id.toString()}`] || catByName[subLower];
          categoryDoc = subMatch || mainMatch;
        } else {
          categoryDoc = mainMatch;
        }

        const images = [colMap.image1, colMap.image2, colMap.image3, colMap.image4, colMap.image5]
          .map(c => cell(row, c)).filter(Boolean);
        const thumbnail = cell(row, colMap.thumbnail) || images[0] || '';

        const tagsRaw = cell(row, colMap.tags);
        const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

        const specsRaw = cell(row, colMap.specifications);
        const specifications = specsRaw
          ? specsRaw.split('|').map(s => s.trim()).filter(Boolean).map(pair => {
              const idx = pair.indexOf(':');
              return idx === -1
                ? { key: pair.trim(), value: '' }
                : { key: pair.slice(0, idx).trim(), value: pair.slice(idx + 1).trim() };
            })
          : [];

        const statusRaw   = cell(row, colMap.status).toLowerCase();
        const isActive    = statusRaw === 'hidden' || statusRaw === 'inactive' ? false : true;
        const featuredRaw = cell(row, colMap.isFeatured).toLowerCase();
        const isFeatured  = featuredRaw === 'yes' || featuredRaw === 'true';

        const salePrice = num(row, colMap.salePrice);
        const conditionRaw = cell(row, colMap.condition).toLowerCase();
        const condition = ['used', 'refurbished'].includes(conditionRaw) ? conditionRaw : 'new';
        const noIdentifiersRaw = cell(row, colMap.noIdentifiers).toLowerCase();

        const productData = normalizeMerchantFields({
          tenantId,
          name,
          description,
          shortDescription: cell(row, colMap.shortDescription) || undefined,
          category:    categoryDoc._id,
          subCategory: subCatName || undefined,
          brand:       cell(row, colMap.brand) || undefined,
          sku:         cell(row, colMap.sku) || undefined,
          gtin:        cell(row, colMap.gtin) || '',
          mpn:         cell(row, colMap.mpn) || '',
          condition,
          googleProductCategory: cell(row, colMap.googleProductCategory) || '',
          identifierExists: ['yes', 'true'].includes(noIdentifiersRaw) ? false : undefined,
          price:       priceVal,
          salePrice:   salePrice,
          costPrice:   num(row, colMap.costPrice),
          stock:       num(row, colMap.stock) ?? 0,
          lowStockThreshold: num(row, colMap.lowStockThreshold) ?? 5,
          weight:      num(row, colMap.weight),
          tags,
          thumbnail,
          images,
          specifications,
          isActive,
          isFeatured,
          isOnSale: !!salePrice,
          normalizedName: normalizeProductValue(name),
          normalizedSku: normalizeProductValue(cell(row, colMap.sku)),
          duplicateIndexEligible: true,
        });
        validateActiveProduct(productData);

        const duplicate = await findProductDuplicate(tenantId, productData.name, productData.sku);
        if (duplicate) {
          const sameSku = normalizeProductValue(productData.sku) && normalizeProductValue(duplicate.sku) === normalizeProductValue(productData.sku);
          throw new Error(`Duplicate ${sameSku ? 'SKU' : 'name'}; existing product "${duplicate.name}"${duplicate.sku ? ` (${duplicate.sku})` : ''}`);
        }

        productData.slug = await makeUniqueProductSlug(productData.slug || productData.name, tenantId);
        const product = await Product.create(productData);
        results.created++;

        // Fire automation for each newly-created active product (non-blocking)
        if (product.isActive !== false) {
          dispatchForTrigger('new_product', product, 'product').catch(e =>
            console.error('[Automation] new_product dispatch error:', e.message)
          );
        }
      } catch (err) {
        results.skipped++;
        const message = duplicateKeyError(err) ? `Duplicate ${duplicateKeyLabel(err)} in this store` : err.message;
        results.errors.push({ row: r, name: name || '(blank)', message });
      }
    }

    res.json(results);
  } catch (err) {
    console.error('[Bulk Import]', err.message);
    res.status(err.statusCode || 500).json({ message: 'Import failed: ' + err.message });
  }
});

// Admin — distinct list of brands across all products (used by the Coupon
// "Applicable Brands" dropdown). Returns a clean, sorted, de-duplicated list.
router.get('/admin/brands', adminAuth, async (req, res) => {
  try {
    const tenantId = requireTenantForAdmin(req, res);
    if (!tenantId) return;
    const brands = await Product.distinct('brand', { tenantId, brand: { $nin: [null, ''] } });
    res.json(brands.filter(Boolean).sort((a, b) => a.localeCompare(b)));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Public — active brands for the current storefront tenant.
// Product.brand is a text field, so use a representative product image as the
// brand tile image until a dedicated brand-logo model exists.
router.get('/brands', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(404).json({ brands: [] });
    const limit = Math.min(parseInt(req.query.limit, 10) || 16, 48);
    const products = await Product.find({
      tenantId,
      isActive: true,
      brand: { $exists: true, $nin: [null, ''] },
    })
      .select('brand thumbnail images slug soldCount updatedAt')
      .sort({ soldCount: -1, updatedAt: -1 })
      .limit(1000)
      .lean();

    const byBrand = new Map();
    products.forEach(product => {
      const name = String(product.brand || '').trim();
      if (!name) return;
      const key = name.toLowerCase();
      const image = product.thumbnail || product.images?.[0] || '';
      const existing = byBrand.get(key);
      if (existing) {
        existing.productCount += 1;
        if (!existing.image && image) existing.image = normalizeImageUrl(image);
        return;
      }
      byBrand.set(key, {
        name,
        slug: slugify(name),
        image: image ? normalizeImageUrl(image) : '',
        productCount: 1,
      });
    });

    const brands = Array.from(byBrand.values())
      .sort((a, b) => b.productCount - a.productCount || a.name.localeCompare(b.name))
      .slice(0, limit);

    res.json({ brands });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Admin — cascading lookup for the Coupon eligibility picker.
// Supports three modes:
//   1. Filter mode: ?brand=X&category=Y&subCategory=Z
//      → returns the narrowed lists of categories, subCategories, and matching products
//   2. ID mode: ?ids=id1,id2,...
//      → returns those specific products by _id (used to re-hydrate chips when editing a coupon)
//   3. Search mode: ?search=keyword
//      → full-text name search across all active products (used by excluded products picker)
router.get('/admin/lookup', normalizeImagesMiddleware(), adminAuth, async (req, res) => {
  try {
    const { brand, category, subCategory, ids, search } = req.query;
    const tenantId = requireTenantForAdmin(req, res);
    if (!tenantId) return;

    // ── Mode 2: fetch by explicit IDs ──────────────────────────────────────
    if (ids) {
      const idList = ids.split(',').filter(Boolean);
      const products = await Product.find({ tenantId, _id: { $in: idList } })
        .select('name price salePrice thumbnail brand category subCategory')
        .lean();
      return res.json({ products, categories: [], subCategories: [] });
    }

    // ── Mode 3: search by name keyword ─────────────────────────────────────
    if (search) {
      const products = await Product.find({
        tenantId,
        isActive: true,
        name: { $regex: search.trim(), $options: 'i' },
      })
        .select('name price salePrice thumbnail brand category subCategory')
        .limit(30)
        .lean();
      return res.json({ products, categories: [], subCategories: [] });
    }

    // ── Mode 1: cascading filter ───────────────────────────────────────────
    // Build the product filter incrementally
    const productFilter = { tenantId, isActive: true };
    if (brand)       productFilter.brand       = brand;
    if (category)    productFilter.category    = category;
    if (subCategory) productFilter.subCategory = subCategory;

    // Fetch matching products (capped at 200 for performance)
    const products = await Product.find(productFilter)
      .select('name price salePrice thumbnail brand category subCategory')
      .limit(200)
      .lean();

    // Derive the narrowed category list from those products
    const categoryIds = [...new Set(products.map(p => p.category?.toString()).filter(Boolean))];
    const categories  = await Category.find({ tenantId, _id: { $in: categoryIds } })
      .select('name')
      .lean();

    // Derive the distinct subCategories from those products
    const subCategories = [...new Set(products.map(p => p.subCategory).filter(Boolean))]
      .sort()
      .map(name => ({ _id: name, name })); // treat subCategory string as both id and name

    res.json({ products, categories, subCategories });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/admin/all', normalizeImagesMiddleware(), adminAuth, async (req, res) => {
  try {
    const { search, category, brand, status, stock, page = 1, limit = 20 } = req.query;
    const tenantId = requireTenantForAdmin(req, res);
    if (!tenantId) return;
    const filter = { tenantId };
    if (search)   filter.$or = [
      { name:  new RegExp(search, 'i') },
      { brand: new RegExp(search, 'i') },
      { sku:   new RegExp(search, 'i') },
    ];
    if (category) filter.category = category;
    if (brand)    filter.brand    = new RegExp(`^${brand}$`, 'i');
    let duplicateData = null;
    if (status === 'duplicates') {
      duplicateData = await tenantDuplicateMap(tenantId);
      filter._id = { $in: Array.from(duplicateData.map.keys()) };
    }
    if (status === 'active')   filter.isActive = true;
    if (status === 'hidden')   filter.isActive = false;
    if (status === 'featured') filter.isFeatured = true;
    if (status === 'sale')     filter.isOnSale = true;
    if (stock  === 'out')      filter.stock = 0;
    if (stock  === 'low')      { filter.stock = { $gt: 0, $lte: 5 }; }
    const total    = await Product.countDocuments(filter);
    const products = await Product.find(filter)
      .populate('category', 'name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit)).lean();
    if (!duplicateData) duplicateData = await tenantDuplicateMap(tenantId);
    const annotated = products.map(product => ({ ...product, duplicateInfo: duplicateData.map.get(product._id.toString()) || null }));
    res.json({ products: annotated, total, pages: Math.ceil(total / limit), duplicateGroups: duplicateData.groups, duplicateProductCount: duplicateData.map.size });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Admin — create product
router.post('/', adminAuth, async (req, res) => {
  let product;
  try {
    const tenantId = requireTenantForAdmin(req, res);
    if (!tenantId) return;
    await assertProductLimit(tenantId);
    const body = normalizeMerchantFields({ ...req.body, tenantId });
    validateActiveProduct(body);
    const duplicate = await findProductDuplicate(tenantId, body.name, body.sku);
    if (duplicate) return duplicateConflict(res, duplicate, body.name, body.sku);
    body.normalizedName = normalizeProductValue(body.name);
    body.normalizedSku = normalizeProductValue(body.sku);
    body.duplicateIndexEligible = true;
    body.slug = await makeUniqueProductSlug(body.slug || body.name, tenantId);
    product = await Product.create(body);
    res.status(201).json(product);
  } catch (err) {
    if (duplicateKeyError(err)) return res.status(409).json({ message: `Duplicate product ${duplicateKeyLabel(err)} in this store`, code: 'DUPLICATE_PRODUCT' });
    return res.status(err.statusCode || 500).json({ message: err.message });
  }

  // Fire automation AFTER response is sent — non-blocking
  try {
    if (product.isActive !== false) {
      await dispatchForTrigger('new_product', product, 'product');
    }
  } catch (err) {
    console.error('[Automation] new_product dispatch error:', err.message);
  }
});

// Admin — update product
router.put('/:id', adminAuth, async (req, res) => {
  let before, product;
  try {
    const tenantId = requireTenantForAdmin(req, res);
    if (!tenantId) return;
    before  = await Product.findOne({ _id: req.params.id, tenantId }).lean();
    if (!before) return res.status(404).json({ message: 'Product not found' });
    const body = normalizeMerchantFields({ ...req.body });
    delete body.tenantId;
    const nextName = body.name === undefined ? before.name : body.name;
    const nextSku = body.sku === undefined ? before.sku : body.sku;
    validateActiveProduct({ ...before, ...body, tenantId });
    const identityChanged = normalizeProductValue(nextName) !== normalizeProductValue(before.name)
      || normalizeProductValue(nextSku) !== normalizeProductValue(before.sku);
    if (identityChanged) {
      const duplicate = await findProductDuplicate(tenantId, nextName, nextSku, req.params.id);
      if (duplicate) return duplicateConflict(res, duplicate, nextName, nextSku);
      body.normalizedName = normalizeProductValue(nextName);
      body.normalizedSku = normalizeProductValue(nextSku);
      body.duplicateIndexEligible = true;
    }
    if (before.isStarterSample && (
      identityChanged ||
      (body.thumbnail && body.thumbnail !== before.thumbnail) ||
      (Array.isArray(body.images) && body.images.some(image => !(before.images || []).includes(image)))
    )) {
      body.isStarterSample = false;
    }
    if (body.slug || body.name) body.slug = await makeUniqueProductSlug(body.slug || body.name, tenantId, req.params.id);
    product = await Product.findOneAndUpdate(
      { _id: req.params.id, tenantId }, { $set: { ...body, updatedAt: new Date() } }, { new: true, runValidators: false }
    );
    res.json(product);
  } catch (err) {
    if (duplicateKeyError(err)) return res.status(409).json({ message: `Duplicate product ${duplicateKeyLabel(err)} in this store`, code: 'DUPLICATE_PRODUCT' });
    return res.status(err.statusCode || 500).json({ message: err.message });
  }

  // Fire discount trigger when salePrice is newly set or changed
  try {
    const hadSale    = !!before?.salePrice;
    const nowHasSale = !!req.body.salePrice;
    const saleChanged = hadSale
      ? (req.body.salePrice && String(req.body.salePrice) !== String(before.salePrice))
      : nowHasSale;
    if (saleChanged && product.isActive !== false) {
      await dispatchForTrigger('product_discount', product, 'product');
    }
  } catch (err) {
    console.error('[Automation] product_discount dispatch error:', err.message);
  }
});

// Admin — unrelated quick flags deliberately bypass duplicate identity checks.
router.patch('/admin/:id/quick-flags', adminAuth, async (req, res) => {
  try {
    const tenantId = requireTenantForAdmin(req, res);
    if (!tenantId) return;
    const allowed = {};
    if (typeof req.body.isFeatured === 'boolean') allowed.isFeatured = req.body.isFeatured;
    if (typeof req.body.isOnSale === 'boolean') allowed.isOnSale = req.body.isOnSale;
    if (!Object.keys(allowed).length) return res.status(400).json({ message: 'Provide isFeatured or isOnSale as a boolean' });
    if (allowed.isOnSale === true) {
      const current = await Product.findOne({ _id: req.params.id, tenantId }).select('price salePrice').lean();
      if (!current) return res.status(404).json({ message: 'Product not found in this store' });
      if (!(Number(current.salePrice) > 0) || Number(current.salePrice) >= Number(current.price)) {
        return res.status(400).json({ message: 'Add a sale price lower than the regular price before enabling On Sale' });
      }
    }
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, tenantId },
      { $set: { ...allowed, updatedAt: new Date() } },
      { new: true, runValidators: true }
    ).populate('category', 'name');
    if (!product) return res.status(404).json({ message: 'Product not found in this store' });
    res.json(product);
  } catch (err) { res.status(500).json({ message: err.message }); }
});


// Admin — manual publish a product to social media platforms
// POST /api/products/:id/publish
// Body: { platforms: ['facebook','instagram',...], customMsg?: '' }
router.post('/:id/publish', adminAuth, async (req, res) => {
  try {
    const tenantId = requireTenantForAdmin(req, res);
    if (!tenantId) return;
    const product = await Product.findOne({ _id: req.params.id, tenantId });
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const { platforms = [], customMsg = '' } = req.body;
    if (!platforms.length) return res.status(400).json({ message: 'Select at least one platform' });

    const adminUserId = req.admin?._id?.toString() || 'unknown';

    const results = await Promise.allSettled(
      platforms.map(platform =>
        manualPublish({
          platform,
          entityType:  'product',
          entityId:    product._id.toString(),
          entityName:  product.name,
          customMsg,
          trigger:     'manual',
          adminUserId,
        })
      )
    );

    const logs = results.map((r, i) => ({
      platform: platforms[i],
      status:   r.value?.status ?? 'failed',
      message:  r.value?.errorMessage || (r.reason?.message ?? ''),
      errorCode: r.value?.errorCode || '',
    }));

    // Log every result to server console so errors are visible in Railway/local terminal
    logs.forEach(l => {
      if (l.status === 'success') {
        console.log(`[Publish] ✅ ${l.platform} — success`);
      } else {
        console.error(`[Publish] ❌ ${l.platform} — ${l.errorCode}: ${l.message}`);
      }
    });

    // Always return 200 with the logs array so the frontend can read
    // per-platform error messages from data.logs — returning 500 causes
    // axios to throw and the catch block shows only a generic message.
    res.status(200).json({ logs });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Admin — hard delete
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const tenantId = requireTenantForAdmin(req, res);
    if (!tenantId) return;
    const deleted = await Product.findOneAndDelete({ _id: req.params.id, tenantId });
    if (!deleted) return res.status(404).json({ message: 'Product not found' });
    res.json({ message: 'Product deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Public — list with filters (✅ WITH IMAGE NORMALIZATION)
router.get('/', normalizeImagesMiddleware(), async (req, res) => {
  try {
    const { category, subCategory, search, minPrice, maxPrice, sort, featured, onSale, brand } = req.query;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 12, 1), 100);
    const filter = { isActive: true };
    if (req.tenantId) filter.tenantId = req.tenantId;
    if (category) filter.category  = category;
    if (subCategory) filter.subCategory = subCategory;
    if (featured) filter.isFeatured = true;
    if (onSale)   filter.isOnSale   = true;
    if (brand)    filter.brand       = new RegExp(brand, 'i');
    if (search)   filter.$or = [
      { name: new RegExp(search, 'i') },
      { description: new RegExp(search, 'i') },
      { tags: new RegExp(search, 'i') },
    ];
    if (minPrice || maxPrice) {
      const min = minPrice ? Number(minPrice) : null;
      const max = maxPrice ? Number(maxPrice) : null;
      const priceRange = {};
      if (min !== null) priceRange.$gte = min;
      if (max !== null) priceRange.$lte = max;
      // Match products where effective price is in range:
      // - On-sale products: use salePrice (discounted price)
      // - Regular products: use price
      filter.$and = filter.$and || [];
      filter.$and.push({
        $or: [
          // Product has an active sale — match against salePrice
          { isOnSale: true, salePrice: priceRange },
          // Product has no active sale — match against regular price
          { $or: [{ isOnSale: false }, { isOnSale: { $exists: false } }], price: priceRange },
        ],
      });
    }
    let sortObj = { createdAt: -1 };
    if (sort === 'price_asc')  sortObj = { price: 1 };
    if (sort === 'price_desc') sortObj = { price: -1 };
    if (sort === 'popular')    sortObj = { soldCount: -1 };
    if (sort === 'rating')     sortObj = { 'ratings.average': -1 };
    const total    = await Product.countDocuments(filter);
    const products = await Product.find(filter)
      .select('name slug price salePrice isOnSale thumbnail images stock lowStockThreshold category subCategory brand ratings variants isFeatured tags soldCount createdAt updatedAt')
      .populate('category', 'name slug')
      .sort(sortObj)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    res.json({ products, total, pages: Math.ceil(total / limit), page });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Public — similar products by product ID (scored by tags, category, brand, price range) (✅ WITH IMAGE NORMALIZATION)
// GET /api/products/:id/similar?limit=6
router.get('/:id/similar', normalizeImagesMiddleware(), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 6, 12);
    const source = await Product.findOne({
      _id: req.params.id,
      ...(req.tenantId ? { tenantId: req.tenantId } : {}),
    }).populate('category', 'name slug').lean();
    if (!source) return res.status(404).json({ message: 'Product not found' });

    // Build a broad candidate pool: same category OR overlapping tags OR same brand
    const orConditions = [];
    if (source.category?._id) orConditions.push({ category: source.category._id });
    if (source.tags?.length)   orConditions.push({ tags: { $in: source.tags } });
    if (source.brand)          orConditions.push({ brand: source.brand });

    const candidates = await Product.find({
      _id:      { $ne: source._id },
      isActive: true,
      ...(req.tenantId ? { tenantId: req.tenantId } : {}),
      ...(orConditions.length ? { $or: orConditions } : {}),
    })
      .populate('category', 'name slug')
      .lean();

    // Score each candidate — higher = more similar
    const effectivePrice = p => p.isOnSale && p.salePrice ? p.salePrice : p.price;
    const sourcePrice    = effectivePrice(source);

    const scored = candidates.map(p => {
      let score = 0;

      // Same category → strong signal
      if (p.category?._id?.toString() === source.category?._id?.toString()) score += 40;

      // Same subcategory → extra boost
      if (source.subCategory && p.subCategory && source.subCategory.toString() === p.subCategory.toString()) score += 20;

      // Overlapping tags — weight by overlap ratio
      const srcTags  = new Set((source.tags || []).map(t => t.toLowerCase()));
      const candTags = (p.tags || []).map(t => t.toLowerCase());
      const sharedTags = candTags.filter(t => srcTags.has(t)).length;
      if (srcTags.size > 0) score += Math.round((sharedTags / srcTags.size) * 35);

      // Same brand
      if (source.brand && p.brand && source.brand.toLowerCase() === p.brand.toLowerCase()) score += 15;

      // Similar price (within 30% of source price)
      if (sourcePrice > 0) {
        const priceDiff = Math.abs(effectivePrice(p) - sourcePrice) / sourcePrice;
        if (priceDiff <= 0.1) score += 10;
        else if (priceDiff <= 0.2) score += 6;
        else if (priceDiff <= 0.3) score += 3;
      }

      // Popularity boost (normalised, max 5 pts)
      score += Math.min(5, Math.round((p.soldCount || 0) / 20));

      return { ...p, _similarityScore: score };
    });

    // Sort by score desc, then by soldCount for ties
    scored.sort((a, b) =>
      b._similarityScore - a._similarityScore ||
      (b.soldCount || 0) - (a.soldCount || 0)
    );

    const results = scored.slice(0, limit).map(({ _similarityScore, ...p }) => p);
    res.json(results);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Public — single product by slug (wildcard — MUST be last) (✅ WITH IMAGE NORMALIZATION)
router.get('/:slug', normalizeImagesMiddleware(), async (req, res) => {
  try {
    const product = await Product.findOneAndUpdate(
      { slug: req.params.slug, isActive: true, ...(req.tenantId ? { tenantId: req.tenantId } : {}) },
      { $inc: { views: 1 } },
      { new: true }
    ).populate('category', 'name slug');
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
