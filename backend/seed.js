'use strict';

const mongoose = require('mongoose');
const crypto = require('crypto');
require('dotenv').config();
const { assertSafeStagingDatabase } = require('./utils/stagingSafety');
assertSafeStagingDatabase(process.env);

const User = require('./models/User');
const Tenant = require('./models/Tenant');
const Plan = require('./models/Plan');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/storekit';
const superAdminPassword = process.env.SEED_SUPERADMIN_PASSWORD || `${crypto.randomBytes(14).toString('base64url')}!9a`;
const storeAdminPassword = process.env.SEED_STORE_ADMIN_PASSWORD || `${crypto.randomBytes(14).toString('base64url')}!9a`;

if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PRODUCTION_SEED !== 'true') {
  throw new Error('Production seeding is disabled. Set ALLOW_PRODUCTION_SEED=true only for an intentional seed run.');
}

async function dropLegacyIndexes() {
  try {
    const indexes = await Plan.collection.indexes();
    const hasLegacySlugIndex = indexes.some((index) => index.name === 'slug_1');

    if (hasLegacySlugIndex) {
      await Plan.collection.dropIndex('slug_1');
      console.log('✅ Removed old broken plans.slug index');
    }
  } catch (error) {
    if (!String(error.message).includes('index not found')) {
      console.log(`⚠️ Index cleanup skipped: ${error.message}`);
    }
  }
}

async function main() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected');

    await dropLegacyIndexes();

    await User.deleteMany({
      $or: [
        { email: 'superadmin@storekit.local' },
        { email: 'admin@storekit.local' },
        { username: 'superadmin' },
        { username: 'storeadmin' },
        { username: 'admin' },
      ],
    });

    const starterPlan = await Plan.findOneAndUpdate(
      { slug: 'starter' },
      {
        $set: {
          name: 'Starter',
          slug: 'starter',
          description: 'Small store plan for starting ecommerce customers.',
          price: 0,
          currency: 'LKR',
          billingCycle: 'monthly',
          active: true,
          limits: {
            products: 100,
            ordersPerMonth: 500,
            admins: 2,
            storageMb: 500,
          },
          features: {
            products: true,
            orders: true,
            customers: true,
            categories: true,
            coupons: true,
            banners: true,
            reviews: false,
            giftCards: false,
            returns: false,
            seo: false,
            analytics: false,
            themeBuilder: true,
            layoutEditor: false,
            customDomain: true,
            metaPixel: false,
            automation: false,
            backup: false,
          },
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const proPlan = await Plan.findOneAndUpdate(
      { slug: 'pro' },
      {
        $set: {
          name: 'Pro',
          slug: 'pro',
          description: 'Full StoreKit SaaS ecommerce plan with advanced selling tools.',
          price: 4990,
          currency: 'LKR',
          billingCycle: 'monthly',
          active: true,
          limits: {
            products: 1000,
            ordersPerMonth: 5000,
            admins: 10,
            storageMb: 5000,
          },
          features: {
            products: true,
            orders: true,
            customers: true,
            categories: true,
            coupons: true,
            banners: true,
            reviews: true,
            giftCards: true,
            returns: true,
            seo: true,
            analytics: true,
            themeBuilder: true,
            layoutEditor: true,
            customDomain: true,
            metaPixel: true,
            automation: true,
            backup: true,
          },
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log('✅ Plans');

    const demoTenant = await Tenant.findOneAndUpdate(
      { slug: 'demo' },
      {
        $set: {
          storeName: 'Demo Store',
          slug: 'demo',
          plan: proPlan._id,
          status: 'active',
          domains: [
            { domain: 'localhost', type: 'system', verified: true, active: true },
            { domain: '127.0.0.1', type: 'system', verified: true, active: true },
          ],
          settings: {
            storeEmail: 'admin@storekit.local',
            phone: '0775474001',
            whatsapp: '0775474001',
            currency: 'LKR',
            country: 'Sri Lanka',
            timezone: 'Asia/Colombo',
            metaTitle: 'Demo Store | Powered by StoreKit',
            metaDescription: 'Multi-tenant ecommerce store powered by StoreKit.',
          },
          theme: {
            primaryColor: '#15803d',
            accentColor: '#84cc16',
            darkColor: '#0f172a',
            fontFamily: 'Inter',
          },
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log('✅ Demo tenant');

    const superAdmin = await User.create({
      firstName: 'Super',
      lastName: 'Admin',
      username: 'superadmin',
      email: 'superadmin@storekit.local',
      password: superAdminPassword,
      role: 'superadmin',
      tenantId: null,
      isActive: true,
      isVerified: true,
    });

    console.log(`✅ Super Admin: superadmin@storekit.local / ${superAdminPassword}`);

    const storeAdmin = await User.create({
      firstName: 'Store',
      lastName: 'Admin',
      username: 'storeadmin',
      email: 'admin@storekit.local',
      password: storeAdminPassword,
      role: 'admin',
      tenantId: demoTenant._id,
      isActive: true,
      isVerified: true,
    });

    await Tenant.findByIdAndUpdate(demoTenant._id, {
      $set: { owner: storeAdmin._id, plan: proPlan._id },
    });

    await Plan.syncIndexes();
    await User.syncIndexes();
    await Tenant.syncIndexes();

    console.log(`✅ Store Admin: admin@storekit.local / ${storeAdminPassword}`);
    console.log('✅ Tenant owner assigned');
    console.log('');
    console.log('======================================');
    console.log('✅ StoreKit seed completed');
    console.log('======================================');
    console.log('Super Admin URL: http://localhost:3000/superadmin/login');
    console.log('Super Admin Email: superadmin@storekit.local');
    console.log(`Super Admin Password: ${superAdminPassword}`);
    console.log('');
    console.log('Store Admin URL: http://localhost:3000/login then /admin');
    console.log('Store Admin Email: admin@storekit.local');
    console.log(`Store Admin Password: ${storeAdminPassword}`);
    console.log('======================================');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌', error.message);
    process.exit(1);
  }
}

main();
