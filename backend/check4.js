require('dotenv').config();
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const Product = require('./models/Product');
  const { dispatchForTrigger } = require('./services/publisherService');
  const product = await Product.findOne({ isActive: true });
  if (!product) {
    console.log('No active product found in DB');
    mongoose.disconnect();
    return;
  }
  console.log('Testing with product:', product.name);
  console.log('Product ID:', product._id);
  await dispatchForTrigger('new_product', product, 'product');
  console.log('dispatchForTrigger called - check logs above for result');
  setTimeout(function() { mongoose.disconnect(); }, 4000);
}).catch(e => { console.error(e.message); process.exit(1); });
