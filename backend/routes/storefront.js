'use strict';

const express = require('express');
const Product = require('../models/Product');
const { Category, Banner } = require('../models/index');
const { normalizeProductImages, normalizeEntityImages } = require('../utils/imageUrlHelper');
const { requiredTenantId, disableSharedTenantCaching, sendTenantResolutionError } = require('../utils/tenantGuard');

const router = express.Router();

const PRODUCT_FIELDS = 'name slug price salePrice isOnSale thumbnail images stock lowStockThreshold category subCategory brand ratings variants isFeatured tags soldCount createdAt updatedAt';

function activeBannerFilter(now) {
  return {
    isActive: true,
    position: { $in: ['hero', 'promo'] },
    $and: [
      { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
      { $or: [{ endDate: null }, { endDate: { $gte: now } }] },
    ],
  };
}

function buildBrands(products, limit) {
  const byBrand = new Map();
  products.forEach(product => {
    const name = String(product.brand || '').trim();
    if (!name) return;
    const key = name.toLocaleLowerCase('en');
    const image = product.thumbnail || product.images?.[0] || '';
    const current = byBrand.get(key);
    if (current) {
      current.productCount += 1;
      if (!current.image && image) current.image = image;
      return;
    }
    byBrand.set(key, {
      name,
      slug: name.toLocaleLowerCase('en').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'brand',
      image,
      productCount: 1,
    });
  });
  return Array.from(byBrand.values())
    .sort((a, b) => b.productCount - a.productCount || a.name.localeCompare(b.name))
    .slice(0, limit);
}

// One tenant-scoped response replaces the seven-request homepage waterfall.
router.get('/home', async (req, res, next) => {
  try {
    disableSharedTenantCaching(res);
    const tenantId = requiredTenantId(req);

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 8, 1), 12);
    const now = new Date();
    const productFilter = { tenantId, isActive: true };

    const [featured, newArrivals, onSale, categories, brandProducts, banners] = await Promise.all([
      Product.find({ ...productFilter, isFeatured: true }).select(PRODUCT_FIELDS).populate('category', 'name slug').sort({ createdAt: -1 }).limit(limit).lean(),
      Product.find(productFilter).select(PRODUCT_FIELDS).populate('category', 'name slug').sort({ createdAt: -1 }).limit(limit).lean(),
      Product.find({ ...productFilter, isOnSale: true }).select(PRODUCT_FIELDS).populate('category', 'name slug').sort({ createdAt: -1 }).limit(8).lean(),
      Category.find({ tenantId, isActive: true, parent: null }).sort({ sortOrder: 1, name: 1 }).limit(12).lean(),
      Product.find({ ...productFilter, brand: { $exists: true, $nin: [null, ''] } })
        .select('brand thumbnail images soldCount updatedAt').sort({ soldCount: -1, updatedAt: -1 }).limit(500).lean(),
      Banner.find({ tenantId, ...activeBannerFilter(now) }).sort({ sortOrder: 1, createdAt: -1 }).lean(),
    ]);

    const normalizedProducts = rows => rows.map(normalizeProductImages);
    const normalizedBanners = banners.map(normalizeEntityImages);
    return res.json({
      featured: normalizedProducts(featured),
      newArrivals: normalizedProducts(newArrivals),
      onSale: normalizedProducts(onSale),
      categories: categories.map(normalizeEntityImages),
      brands: buildBrands(brandProducts.map(normalizeProductImages), 16),
      heroBanners: normalizedBanners.filter(banner => banner.position === 'hero'),
      promoBanners: normalizedBanners.filter(banner => banner.position === 'promo'),
    });
  } catch (err) {
    if (sendTenantResolutionError(res, err)) return undefined;
    return next(err);
  }
});

module.exports = router;
