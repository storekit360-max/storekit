'use strict';
const express = require('express');
const Tenant = require('../models/Tenant');
const SubscriptionInvoice = require('../models/SubscriptionInvoice');
const SubscriptionPayment = require('../models/SubscriptionPayment');
const { auth } = require('../middleware/auth');
const { ensureOpenInvoice } = require('../services/subscriptionBillingService');
const router = express.Router();
router.use(auth);
function requireTenantAdmin(req,res,next){ if(!['admin','superadmin'].includes(req.user?.role)) return res.status(403).json({message:'Admin access required'}); next(); }
router.use(requireTenantAdmin);
async function tenantFor(req){ const id = req.user?.tenantId || req.tenantId; if(!id) return null; return Tenant.findById(id).populate('plan').populate('owner','email firstName lastName'); }
router.get('/status', async (req,res,next)=>{ try{ const tenant=await tenantFor(req); if(!tenant) return res.status(404).json({message:'Tenant not found'}); const invoices=await SubscriptionInvoice.find({tenantId:tenant._id}).sort({createdAt:-1}).limit(20); const payments=await SubscriptionPayment.find({tenantId:tenant._id}).sort({createdAt:-1}).limit(20); const openInvoice=await ensureOpenInvoice(tenant); res.json({tenant, plan:tenant.plan, subscription:tenant.subscription, openInvoice, invoices, payments}); }catch(e){next(e);} });
router.post('/payments', async (req,res,next)=>{ try{ const tenant=await tenantFor(req); if(!tenant) return res.status(404).json({message:'Tenant not found'}); const invoice = req.body.invoiceId ? await SubscriptionInvoice.findOne({_id:req.body.invoiceId, tenantId:tenant._id}) : await ensureOpenInvoice(tenant); const payment=await SubscriptionPayment.create({ tenantId:tenant._id, invoiceId:invoice?._id, amount:Number(req.body.amount || invoice?.total || 0), currency:req.body.currency || invoice?.currency || tenant.plan?.currency || 'LKR', method:req.body.method || 'manual_bank', reference:req.body.reference || '', proofUrl:req.body.proofUrl || '', submittedBy:req.user._id, status:'pending', note:req.body.note || '' }); if(invoice){ invoice.status='pending_review'; invoice.paymentProofUrl=payment.proofUrl; await invoice.save(); } res.status(201).json(payment); }catch(e){next(e);} });
module.exports = router;
