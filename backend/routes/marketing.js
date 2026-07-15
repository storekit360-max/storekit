'use strict';

const express = require('express');
const router = express.Router();
const { auth, adminAuth } = require('../middleware/auth');
const BehaviorEvent = require('../models/BehaviorEvent');
const User = require('../models/User');
const Product = require('../models/Product');
const Tenant = require('../models/Tenant');

function tenantId(req, res) {
  const id = req.user?.tenantId || req.tenantId;
  if (!id) res.status(400).json({ message: 'Tenant context is required' });
  return id;
}

router.get('/consent', auth, async (req, res) => {
  const id = tenantId(req,res); if(!id)return;
  const user = await User.findOne({ _id: req.user._id, tenantId: id }).select('marketingConsent').lean();
  if(!user)return res.status(404).json({message:'Customer not found'});
  res.json({ granted: Boolean(user.marketingConsent?.granted), updatedAt: user.marketingConsent?.updatedAt });
});

router.put('/consent', auth, async (req, res) => {
  const id=tenantId(req,res);if(!id)return;
  if(typeof req.body.granted!=='boolean')return res.status(400).json({message:'granted must be a boolean'});
  const consent={granted:req.body.granted,updatedAt:new Date(),source:'customer_account'};
  const user=await User.findOneAndUpdate({_id:req.user._id,tenantId:id},{$set:{marketingConsent:consent}},{new:true}).select('marketingConsent');
  if(!user)return res.status(404).json({message:'Customer not found'});
  res.json({granted:user.marketingConsent.granted,updatedAt:user.marketingConsent.updatedAt});
});

router.post('/events', auth, async (req, res) => {
  try {
    const id=tenantId(req,res);if(!id)return;
    const tenant=await Tenant.findById(id).select('settings.marketingTrackingEnabled').lean();
    if(tenant?.settings?.marketingTrackingEnabled===false)return res.status(202).json({tracked:false,reason:'tracking_disabled'});
    const user=await User.findOne({_id:req.user._id,tenantId:id}).select('marketingConsent role').lean();
    if(!user||user.role!=='customer')return res.status(403).json({message:'Customer account required'});
    if(user.marketingConsent?.granted!==true)return res.status(202).json({tracked:false,reason:'consent_required'});
    const eventType=String(req.body.eventType||'').trim().toLowerCase();
    if(!/^[a-z][a-z0-9_]{1,49}$/.test(eventType))return res.status(400).json({message:'Invalid event type'});
    let product=null;
    if(req.body.productId){const exists=await Product.exists({_id:req.body.productId,tenantId:id});if(!exists)return res.status(400).json({message:'Product does not belong to this store'});product=req.body.productId;}
    const metadata={};
    for(const key of ['page','query','campaign'])if(typeof req.body.metadata?.[key]==='string')metadata[key]=req.body.metadata[key].slice(0,200);
    await BehaviorEvent.create({tenantId:id,customer:user._id,eventType,product,device:String(req.body.device||req.get('user-agent')||'').slice(0,80),source:String(req.body.source||'storefront').slice(0,80),metadata});
    res.status(201).json({tracked:true});
  }catch(err){res.status(500).json({message:err.message});}
});

router.get('/admin/analytics', adminAuth, async (req, res) => {
  try {
    const id=tenantId(req,res);if(!id)return;
    const tenant=await Tenant.findById(id).select('settings.marketingTrackingEnabled').lean();
    const since=new Date(Date.now()-24*60*60*1000);
    const [total,last24,trackedRows,consented,grouped,recent]=await Promise.all([
      BehaviorEvent.countDocuments({tenantId:id}),
      BehaviorEvent.countDocuments({tenantId:id,createdAt:{$gte:since}}),
      BehaviorEvent.distinct('customer',{tenantId:id}),
      User.countDocuments({tenantId:id,role:'customer','marketingConsent.granted':true}),
      BehaviorEvent.aggregate([{$match:{tenantId:id}},{$group:{_id:'$eventType',count:{$sum:1}}},{$sort:{count:-1}}]),
      BehaviorEvent.find({tenantId:id}).sort({createdAt:-1}).limit(50).populate('customer','firstName lastName').populate('product','name').lean(),
    ]);
    const enabled=tenant?.settings?.marketingTrackingEnabled!==false;
    const diagnostic=!enabled?'Customer behavior tracking is disabled in store settings.'
      :total===0?'No behavior data yet. Events are recorded only for signed-in customers who explicitly grant marketing consent.':'';
    res.json({enabled,diagnostic,total,last24,trackedCustomers:trackedRows.length,consentedCustomers:consented,
      byType:grouped.map(g=>({type:g._id,count:g.count})),recent:recent.map(e=>({_id:e._id,eventType:e.eventType,
        customer:e.customer?`${e.customer.firstName||''} ${e.customer.lastName||''}`.trim():'Customer',product:e.product?.name||'',device:e.device,source:e.source,createdAt:e.createdAt}))});
  }catch(err){res.status(500).json({message:err.message});}
});

module.exports=router;
