'use strict';
require('dotenv').config();
const mongoose = require('mongoose');
const Tenant = require('../models/Tenant');

const collections = ['products','categories','banners','coupons','settings','businesspages','deals','socialmedias','seasonalcampaigns','giftcards','subscribers','notifications'];

(async()=>{
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI missing');
  await mongoose.connect(process.env.MONGODB_URI);
  const tenants = await Tenant.find({}, { storeName:1, domains:1 }).lean();
  console.log('TENANTS:', tenants.map(t=>({ id:String(t._id), storeName:t.storeName, domains:(t.domains||[]).map(d=>d.domain) })));
  for (const name of collections) {
    try {
      const groups = await mongoose.connection.db.collection(name).aggregate([{ $group:{ _id:'$tenantId', count:{ $sum:1 } } }]).toArray();
      console.log(name, groups.map(g=>({ tenantId:g._id ? String(g._id) : null, count:g.count })));
      await mongoose.connection.db.collection(name).createIndex({ tenantId: 1 });
    } catch (e) { console.log(name, e.message); }
  }
  await mongoose.disconnect();
})().catch(async e=>{ console.error(e); await mongoose.disconnect().catch(()=>{}); process.exit(1); });
