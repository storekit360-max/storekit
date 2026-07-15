'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Order = require('../models/Order');
const { normalizeProductValue } = require('../utils/productDuplicates');
const { compactStatusHistory } = require('../services/curfoxMapping');

const apply = process.argv.includes('--apply');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const orderIndexes=await Order.collection.indexes();
  const legacyGlobalOrderNumberIndex=orderIndexes.find(index=>index.name==='orderNumber_1'&&Object.keys(index.key||{}).length===1);
  const productOps=[];const productGroups=new Map();
  for await (const product of Product.find({ tenantId: { $ne: null } }).select('+normalizedName +normalizedSku +duplicateIndexEligible')) {
    const name=normalizeProductValue(product.name);const sku=normalizeProductValue(product.sku);
    const nameKey=`${product.tenantId}:name:${name}`;const skuKey=sku?`${product.tenantId}:sku:${sku}`:'';
    for(const key of [nameKey,skuKey].filter(Boolean))productGroups.set(key,(productGroups.get(key)||0)+1);
    productOps.push({product,name,sku,nameKey,skuKey});
  }
  let productsChanged=0;
  for(const row of productOps){const eligible=productGroups.get(row.nameKey)===1&&(!row.skuKey||productGroups.get(row.skuKey)===1);if(row.product.normalizedName!==row.name||row.product.normalizedSku!==row.sku||row.product.duplicateIndexEligible!==eligible){productsChanged++;if(apply)await Product.updateOne({_id:row.product._id,tenantId:row.product.tenantId},{$set:{normalizedName:row.name,normalizedSku:row.sku,duplicateIndexEligible:eligible}});}}
  let ordersChanged=0;
  for await(const order of Order.find({tenantId:{$ne:null}})){const set={};if(!order.deliveryService){set.deliveryService='standard';set.deliveryServiceName='Standard Delivery';}const compact=compactStatusHistory(order.statusHistory);if(compact.length!==order.statusHistory.length)set.statusHistory=compact;if(Object.keys(set).length){ordersChanged++;if(apply)await Order.updateOne({_id:order._id,tenantId:order.tenantId},{$set:set});}}
  const orphanProducts=await Product.countDocuments({tenantId:null});const orphanOrders=await Order.countDocuments({tenantId:null});
  if(apply&&legacyGlobalOrderNumberIndex){await Order.collection.createIndex({tenantId:1,orderNumber:1},{unique:true,name:'tenantId_1_orderNumber_1'});await Order.collection.dropIndex(legacyGlobalOrderNumberIndex.name);}
  console.log(JSON.stringify({mode:apply?'apply':'dry-run',productsChanged,ordersChanged,orphanProducts,orphanOrders,legacyGlobalOrderNumberIndex:Boolean(legacyGlobalOrderNumberIndex),note:'Orphan records are reported only and never assigned or deleted automatically. In apply mode the compound tenant order-number index is created before the legacy global index is removed.'},null,2));
  await mongoose.disconnect();
}
run().catch(err=>{console.error(err.message);process.exitCode=1;});
