'use strict';

const { Category, Banner, Settings, PaymentGateway, DeliveryService, BusinessPage } = require('../models/index');

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
  const raw = `${tenant?.theme?.template || tenant?.theme?.theme || ''} ${tenant?.storeName || ''}`.toLowerCase();
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

async function seedDefaultCategories(tenant) {
  const tenantId = tenant._id;
  const categories = TEMPLATE_CATEGORIES[inferTemplateKey(tenant)] || TEMPLATE_CATEGORIES.default;
  for (const [name, slug] of categories) {
    await Category.updateOne(
      { tenantId, slug },
      { $setOnInsert: { tenantId, name, slug, description: `${name} products`, isActive: true, sortOrder: categories.findIndex(c => c[1] === slug) + 1, parent: null } },
      { upsert: true }
    );
  }
}

async function seedDefaultBanner(tenant) {
  const tenantId = tenant._id;
  const existing = await Banner.countDocuments({ tenantId });
  if (existing > 0) return;
  await Banner.create({ tenantId, ...defaultBannerFor(tenant) });
}

async function seedDefaultSettings(tenant) {
  const tenantId = tenant._id;
  const storeEmail = tenant?.settings?.storeEmail || '';
  const whatsapp = tenant?.settings?.whatsapp || tenant?.settings?.phone || '';
  const defaults = [
    ['store_name', tenant.storeName || 'Store', 'general'],
    ['currency', tenant?.settings?.currency || 'LKR', 'general'],
    ['country', tenant?.settings?.country || 'Sri Lanka', 'general'],
    ['timezone', tenant?.settings?.timezone || 'Asia/Colombo', 'general'],
    ['store_email', storeEmail, 'contact'],
    ['whatsapp_number', whatsapp, 'contact'],
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

async function seedDefaultPages(tenant) {
  const tenantId = tenant._id;
  const pages = [
    { slug: 'about-us', title: 'About Us', content: `Welcome to ${tenant.storeName}. We are committed to delivering quality products and reliable service.`, isActive: true, sortOrder: 1 },
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

async function bootstrapTenantStore(tenant) {
  if (!tenant?._id) throw new Error('Valid tenant is required for bootstrap');
  await seedDefaultCategories(tenant);
  await seedDefaultBanner(tenant);
  await seedDefaultSettings(tenant);
  await seedDefaultPaymentsAndDelivery(tenant);
  await seedDefaultPages(tenant);
  return { ok: true };
}

module.exports = { bootstrapTenantStore, slugify };
