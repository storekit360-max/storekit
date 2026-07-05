require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  console.log('Connected to MongoDB\n');

  const AutomationRule = require('./models/AutomationRule');

  // Delete any partial rules and re-seed all 3
  await AutomationRule.deleteMany({});

  const rules = await AutomationRule.insertMany([
    {
      trigger: 'new_product',
      label: 'New Product Published',
      description: 'Auto-post when a new product is added and active',
      enabled: true,
      platforms: { facebook: true, instagram: false, tiktok: false, whatsapp: false, telegram: false },
      customMessage: '',
      minDiscountPercent: 0,
    },
    {
      trigger: 'product_discount',
      label: 'Product Discount Added',
      description: 'Auto-post when a product sale price is set or changed',
      enabled: false,
      platforms: { facebook: false, instagram: false, tiktok: false, whatsapp: false, telegram: false },
      customMessage: '',
      minDiscountPercent: 0,
    },
    {
      trigger: 'offer_active',
      label: 'Offer / Campaign Active',
      description: 'Auto-post when a seasonal campaign is activated',
      enabled: false,
      platforms: { facebook: false, instagram: false, tiktok: false, whatsapp: false, telegram: false },
      customMessage: '',
      minDiscountPercent: 0,
    },
  ]);

  console.log('Rules created:');
  rules.forEach(r => {
    console.log(' -', r.trigger, '| enabled:', r.enabled, '| facebook:', r.platforms.facebook);
  });

  console.log('\nNow doing a LIVE test publish to Facebook...\n');

  const Product = require('./models/Product');
  const { dispatchForTrigger } = require('./services/publisherService');

  const product = await Product.findOne({ isActive: true });
  if (!product) {
    console.log('No active product found - cannot test publish');
    mongoose.disconnect();
    return;
  }

  console.log('Product:', product.name);
  console.log('Image:', product.thumbnail || (product.images && product.images[0]) || 'NONE');
  console.log('Slug:', product.slug);
  console.log('');

  await dispatchForTrigger('new_product', product, 'product');

  // Wait for async publish to complete then check the log
  await new Promise(resolve => setTimeout(resolve, 4000));

  const PublishLog = require('./models/PublishLog');
  const log = await PublishLog.findOne({ platform: 'facebook' }).sort({ createdAt: -1 });

  if (!log) {
    console.log('\nSTILL no log entry - something is wrong with dispatchForTrigger');
  } else {
    console.log('\n--- PUBLISH RESULT ---');
    console.log('status:', log.status);
    console.log('product:', log.entityName);
    console.log('postText:', log.postText);
    console.log('imageUrl:', log.imageUrl);
    console.log('error:', log.errorMessage || 'none');
    console.log('code:', log.errorCode || 'none');
    console.log('FB post ID:', log.platformPostId || 'none');
    console.log('----------------------');
    if (log.status === 'success') {
      console.log('\nSUCCESS - Check your Facebook page now!');
    } else {
      console.log('\nFAILED - error above tells you exactly what to fix');
    }
  }

  mongoose.disconnect();
}).catch(e => { console.error(e.message); process.exit(1); });
