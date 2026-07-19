'use strict';

const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const User = require('../models/User');

async function main() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const existing = await User.findOne({ email: 'storekit360@gmail.com' });
    if (existing) {
      console.log('ℹ️  User already exists. Updating password and role...');
      existing.password = 'Storekit@1234';
      existing.role = 'superadmin';
      existing.tenantId = null;
      existing.isActive = true;
      existing.isVerified = true;
      existing.firstName = 'StoreKit';
      existing.lastName = 'Super Admin';
      existing.username = 'storekit360';
      await existing.save();
      console.log('✅ Updated existing user to superadmin');
    } else {
      await User.create({
        firstName: 'StoreKit',
        lastName: 'Super Admin',
        username: 'storekit360',
        email: 'storekit360@gmail.com',
        password: 'Storekit@1234',
        role: 'superadmin',
        tenantId: null,
        isActive: true,
        isVerified: true,
      });
      console.log('✅ Super admin created: storekit360@gmail.com / Storekit@1234');
    }

    const user = await User.findOne({ email: 'storekit360@gmail.com' }).select('+tokenVersion');
    console.log(`   ID: ${user._id}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Active: ${user.isActive}`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌', error.message);
    process.exit(1);
  }
}

main();