'use strict';

const { Category, Banner, Settings, PaymentGateway, DeliveryService, BusinessPage } = require('../models/index');
const Product = require('../models/Product');
const { fetchPexelsPhotos } = require('../services/starterProductImages');
const { buildFallbackStarterKit } = require('../services/tenantStarterKit');
const { defaultWhatsappConfig } = require('./whatsappConfig');

const REQUIRED_BANNER_POSITIONS = Object.freeze([
  'running_top', 'hero', 'popup', 'flash_sale', 'promo',
  'product_page', 'category_page', 'global',
]);

function slugify(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const TEMPLATE_CATEGORIES = {
  fashion: [
    ['New Arrivals', 'new-arrivals'], ['Women', 'women'], ['Men', 'men'],
    ['Bags & Accessories', 'bags-accessories'], ['Shoes', 'shoes'], ['Sale', 'sale'],
  ],
  electronics: [
    ['Mobile Phones', 'mobile-phones'], ['Power Banks', 'power-banks'], ['Audio', 'audio'],
    ['Smart Gadgets', 'smart-gadgets'], ['Computer Accessories', 'computer-accessories'], ['Deals', 'deals'],
  ],
  beauty: [
    ['Skincare', 'skincare'], ['Hair Care', 'hair-care'], ['Makeup', 'makeup'],
    ['Fragrance', 'fragrance'], ['Personal Care', 'personal-care'], ['Offers', 'offers'],
  ],
  grocery: [
    ['Fresh Food', 'fresh-food'], ['Beverages', 'beverages'], ['Snacks', 'snacks'],
    ['Household', 'household'], ['Baby Care', 'baby-care'], ['Weekly Deals', 'weekly-deals'],
  ],
  default: [
    ['New Arrivals', 'new-arrivals'], ['Best Sellers', 'best-sellers'], ['Featured Products', 'featured-products'],
    ['Accessories', 'accessories'], ['Deals', 'deals'], ['Sale', 'sale'],
  ],
};

function inferTemplateKey(tenant = {}) {
  const raw = `${tenant?.onboarding?.businessType || ''} ${tenant?.theme?.template || tenant?.theme?.theme || ''} ${tenant?.storeName || ''}`.toLowerCase();
  if (/fashion|lily|clothing|dress|boutique/.test(raw)) return 'fashion';
  if (/electronic|mobile|phone|gadget|computer|tech|spare|part/.test(raw)) return 'electronics';
  if (/beauty|cosmetic|skin|hair/.test(raw)) return 'beauty';
  if (/grocery|food|mart|fresh/.test(raw)) return 'grocery';
  return 'default';
}

function defaultBannerFor(tenant = {}) {
  const template = inferTemplateKey(tenant);
  const map = {
    fashion: {
      title: 'Launch Your New Collection',
      subtitle: 'Fresh styles, new arrivals and limited offers',
      buttonText: 'Shop Now',
      link: '/shop',
      position: 'hero',
      sortOrder: 1,
      isActive: true,
    },
    electronics: {
      title: 'Latest Gadgets, Ready to Sell',
      subtitle: 'Showcase your best devices and accessories instantly',
      buttonText: 'Explore Products',
      link: '/shop',
      position: 'hero',
      sortOrder: 1,
      isActive: true,
    },
    default: {
      title: `Welcome to ${tenant.storeName || 'Your Store'}`,
      subtitle: 'Add products, customize your theme and start selling online',
      buttonText: 'Shop Now',
      link: '/shop',
      position: 'hero',
      sortOrder: 1,
      isActive: true,
    },
  };
  return map[template] || map.default;
}

async function seedDefaultCategories(tenant, starterKit = null) {
  const tenantId = tenant._id;
  const generated = Array.isArray(starterKit?.categories) ? starterKit.categories : [];
  const categories = generated.length
    ? generated.map((row, index) => ({ name: row.name, slug: row.slug || slugify(row.name), description: row.description, sortOrder: row.sortOrder || index + 1 }))
    : (TEMPLATE_CATEGORIES[inferTemplateKey(tenant)] || TEMPLATE_CATEGORIES.default)
      .map(([name, slug], index) => ({ name, slug, description: `${name} products`, sortOrder: index + 1 }));
  for (const category of categories) {
    const { name, slug } = category;
    await Category.updateOne(
      { tenantId, slug },
      { $setOnInsert: { tenantId, name, slug, description: category.description || `${name} products`, isActive: true, sortOrder: category.sortOrder, parent: null } },
      { upsert: true }
    );
  }
  return Category.find({ tenantId, slug: { $in: categories.map(row => row.slug) } }).lean();
}

async function seedDefaultBanner(tenant, starterKit = null) {
  const tenantId = tenant._id;
  const fallbackKit = buildFallbackStarterKit({
    storeName: tenant.storeName,
    businessType: tenant?.onboarding?.businessType || 'General retail',
    businessDescription: tenant?.onboarding?.businessDescription || '',
    itemExamples: tenant?.onboarding?.itemExamples || '',
    targetCustomers: tenant?.onboarding?.targetCustomers || '',
    brandTone: tenant?.onboarding?.brandTone || '',
    currency: tenant?.settings?.currency || 'LKR',
  });
  const requested = Array.isArray(starterKit?.banners) ? starterKit.banners : [];
  const requestedByPosition = new Map(requested.map(banner => [banner.position, banner]));
  const fallbackByPosition = new Map((fallbackKit.banners || []).map(banner => [banner.position, banner]));
  const existingPositions = new Set(await Banner.distinct('position', { tenantId }));
  const banners = REQUIRED_BANNER_POSITIONS
    .filter(position => !existingPositions.has(position))
    .map(position => requestedByPosition.get(position) || fallbackByPosition.get(position))
    .filter(Boolean);
  if (!existingPositions.has('sidebar')) {
    const sidebar = requestedByPosition.get('sidebar') || fallbackByPosition.get('sidebar') || defaultBannerFor(tenant);
    if (sidebar) banners.push({ ...sidebar, position: 'sidebar' });
  }
  if (!banners.length) return 0;
  await Banner.insertMany(banners.map((banner, index) => ({
    tenantId,
    ...banner,
    image: '',
    isActive: true,
    sortOrder: banner.sortOrder || index + 1,
    ...(banner.position === 'running_top' ? {
      runningBgColor: tenant?.theme?.primaryColor || '#1e293b',
      runningTextColor: '#ffffff',
      runningSpeed: 28,
    } : {}),
  })));
  return banners.length;
}

async function seedDefaultSettings(tenant) {
  const tenantId = tenant._id;
  const storeEmail = tenant?.settings?.storeEmail || '';
  const whatsapp = tenant?.settings?.whatsappNumber || tenant?.settings?.whatsapp || tenant?.settings?.phone || '';
  const whatsappConfig = defaultWhatsappConfig(whatsapp, tenant.storeName, tenant?.settings?.country);
  const defaults = [
    ['store_name', tenant.storeName || 'Store', 'general'],
    ['currency', tenant?.settings?.currency || 'LKR', 'general'],
    ['country', tenant?.settings?.country || 'Sri Lanka', 'general'],
    ['timezone', tenant?.settings?.timezone || 'Asia/Colombo', 'general'],
    ['store_email', storeEmail, 'contact'],
    ['whatsapp_number', whatsapp, 'contact'],
    ...Object.entries(whatsappConfig).map(([key, value]) => [key, value, 'whatsapp']),
  ];
  for (const [key, value, group] of defaults) {
    await Settings.updateOne(
      { tenantId, key },
      { $setOnInsert: { tenantId, key, value, group, updatedAt: new Date() } },
      { upsert: true }
    );
  }
}

async function seedDefaultPaymentsAndDelivery(tenant) {
  const tenantId = tenant._id;
  await PaymentGateway.updateOne(
    { tenantId, gateway: 'cod' },
    { $setOnInsert: { tenantId, gateway: 'cod', isEnabled: true, isLive: true, displayName: 'Cash on Delivery', config: {}, supportedCurrencies: ['LKR'], updatedAt: new Date() } },
    { upsert: true }
  );
  await DeliveryService.updateOne(
    { tenantId, code: 'standard' },
    { $setOnInsert: { tenantId, name: 'Standard Delivery', code: 'standard', isEnabled: true, codAllowed: true, sortOrder: 1, description: 'Standard islandwide delivery', estimatedDays: '2-5 business days', rates: [{ name: 'Standard', price: 350, freeAbove: 0, estimatedDays: '2-5 business days' }], updatedAt: new Date() } },
    { upsert: true }
  ).catch(() => {});
}

async function seedDefaultPages(tenant, starterKit = null) {
  const tenantId = tenant._id;
  const businessSummary = String(starterKit?.summary || '').trim();
  const businessType = tenant?.onboarding?.businessType || 'quality products';
  const pages = [
    { slug: 'about-us', title: 'About Us', content: `Welcome to ${tenant.storeName}. ${businessSummary || `We are committed to delivering ${businessType} and reliable service.`}`, metaTitle: `About ${tenant.storeName}`, metaDescription: `Learn about ${tenant.storeName} and our commitment to customers.`, isActive: true, sortOrder: 1 },
    { slug: 'contact-us', title: 'Contact Us', content: 'Contact us for product questions, orders, delivery and support.', isActive: true, sortOrder: 2 },
    { slug: 'privacy-policy', title: 'Privacy Policy', content: 'We respect customer privacy and protect customer information.', isActive: true, sortOrder: 3 },
    { slug: 'terms-and-conditions', title: 'Terms and Conditions', content: 'By using this store, customers agree to our store policies and order terms.', isActive: true, sortOrder: 4 },
  ];
  for (const page of pages) {
    await BusinessPage.updateOne(
      { tenantId, slug: page.slug },
      { $setOnInsert: { tenantId, ...page, updatedAt: new Date() } },
      { upsert: true }
    );
  }
}

async function seedStarterProducts(tenant, starterKit, categories) {
  const items = Array.isArray(starterKit?.products) ? starterKit.products : [];
  if (!items.length) return { created: 0, provider: '', warning: '' };
  const tenantId = tenant._id;
  const categoryMap = new Map(categories.map(category => [category.slug, category]));
  const planLimit = Number(tenant?.plan?.limits?.products || 0);
  const existingCount = await Product.countDocuments({ tenantId });
  const room = planLimit > 0 ? Math.max(0, planLimit - existingCount) : items.length;
  const selectedItems = items.slice(0, room);
  const imageResult = await fetchPexelsPhotos({
    businessType: tenant?.onboarding?.businessType,
    itemExamples: tenant?.onboarding?.itemExamples,
  }, selectedItems, selectedItems.length);
  let created = 0;

  for (let itemIndex = 0; itemIndex < selectedItems.length; itemIndex += 1) {
    const item = selectedItems[itemIndex];
    const category = categoryMap.get(item.categorySlug) || categories[0];
    if (!category) continue;
    const slugBase = slugify(item.name).slice(0, 75) || `starter-product-${created + 1}`;
    let slug = slugBase;
    let suffix = 2;
    // Keep bootstrap idempotent while still handling two different names that
    // normalize to the same URL slug.
    // eslint-disable-next-line no-await-in-loop
    while (await Product.exists({ tenantId, slug })) {
      // eslint-disable-next-line no-await-in-loop
      const same = await Product.exists({ tenantId, slug, isStarterSample: true, name: item.name });
      if (same) { slug = null; break; }
      slug = `${slugBase}-${suffix}`;
      suffix += 1;
    }
    if (!slug) continue;
    const normalizedName = String(item.name || '').trim().toLocaleLowerCase('en');
    const normalizedSku = String(item.sku || '').trim().toLocaleLowerCase('en');
    const productImage = imageResult.images[itemIndex] || null;
    // eslint-disable-next-line no-await-in-loop
    await Product.create({
      tenantId,
      name: item.name,
      normalizedName,
      slug,
      description: item.description,
      shortDescription: item.shortDescription,
      price: item.price,
      salePrice: item.salePrice || undefined,
      sku: item.sku,
      normalizedSku,
      duplicateIndexEligible: true,
      category: category._id,
      brand: item.brand,
      identifierExists: false,
      thumbnail: productImage?.image || '/starter-assets/product-placeholder.svg',
      images: [],
      imageAttribution: productImage?.attribution || {},
      stock: item.stock,
      weight: item.weight,
      tags: item.tags || [],
      isFeatured: !!item.isFeatured,
      isOnSale: !!item.isOnSale,
      isActive: true,
      isStarterSample: true,
      createdAt: new Date(Date.now() - ((selectedItems.length - itemIndex) * 1000)),
    });
    created += 1;
  }
  return { created, provider: imageResult.provider, warning: imageResult.warning };
}

async function bootstrapTenantStore(tenant, options = {}) {
  if (!tenant?._id) throw new Error('Valid tenant is required for bootstrap');
  const starterKit = options.starterKit || null;
  const categories = await seedDefaultCategories(tenant, starterKit);
  const banners = await seedDefaultBanner(tenant, starterKit);
  await seedDefaultSettings(tenant);
  await seedDefaultPaymentsAndDelivery(tenant);
  await seedDefaultPages(tenant, starterKit);
  const productResult = await seedStarterProducts(tenant, starterKit, categories);
  if (productResult.provider === 'Pexels') {
    tenant.settings = {
      ...(tenant.settings?.toObject ? tenant.settings.toObject() : tenant.settings || {}),
      starterImagesProvider: 'Pexels',
      starterImagesAttributionUrl: 'https://www.pexels.com/?utm_source=StoreKit&utm_medium=referral',
    };
    await tenant.save();
  }
  return {
    ok: true,
    categories: categories.length,
    products: productResult.created,
    banners,
    imageProvider: productResult.provider || 'local-placeholder',
    warnings: productResult.warning ? [productResult.warning] : [],
  };
}

module.exports = { REQUIRED_BANNER_POSITIONS, bootstrapTenantStore, seedDefaultBanner, slugify };
