'use strict';

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { adminAuth } = require('../middleware/auth');
const CourierIntegration = require('../models/CourierIntegration');
const CourierSubmission = require('../models/CourierSubmission');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { DeliveryService } = require('../models/index');
const { encryptSecret, optionalEncryptedSecret } = require('../utils/secretCrypto');
const client = require('../services/curfoxClient');
const { normalizeSriLankanPhone, resolveDestinationCity, calculatePackageWeight, curfoxCodAmount, applyManualWaybill, canSubmitToCurfox, mergeCourierIntoProcessing, compactStatusHistory, providerRows, mapCurfoxStatus } = require('../services/curfoxMapping');

function tenantId(req, res) {
  const id = req.user?.tenantId || req.tenantId;
  if (!id) res.status(400).json({ message: 'Tenant context is required' });
  return id;
}

const secretSelect = '+encryptedPassword.ciphertext +encryptedPassword.iv +encryptedPassword.tag +encryptedPassword.version';
async function configuration(id) {
  return CourierIntegration.findOne({ tenantId: id, provider: 'curfox' }).select(secretSelect);
}

function publicConfig(config) {
  if (!config) return { provider: 'curfox', enabled: false, hasCredentials: false, defaultPackageWeight: 1, initialStatusKey: 'key_1', manualWaybillsEnabled: false };
  return { provider: 'curfox', enabled: config.enabled, courierTenant: config.courierTenant, merchantEmail: config.merchantEmail,
    merchantBusinessId: config.merchantBusinessId, originCity: config.originCity, originState: config.originState,
    defaultPackageWeight: config.defaultPackageWeight, initialStatusKey: config.initialStatusKey,
    manualWaybillsEnabled: config.manualWaybillsEnabled, hasCredentials: Boolean(config.encryptedPassword?.ciphertext), updatedAt: config.updatedAt };
}

function validateConfiguration(body, requirePassword = false) {
  const connectionFields = [['courierTenant','Courier tenant'],['merchantEmail','Merchant email']];
  for (const [field,label] of connectionFields) if (!String(body[field] || '').trim()) throw Object.assign(new Error(`${label} is required`), { status: 400 });
  if (requirePassword && !String(body.password || '')) throw Object.assign(new Error('Merchant password is required'), { status: 400 });
  if (!(Number(body.defaultPackageWeight) > 0)) throw Object.assign(new Error('Default package weight must be greater than zero'), { status: 400 });
  if (!['key_1','key_2'].includes(body.initialStatusKey)) throw Object.assign(new Error('Initial status must be Draft or Confirmed'), { status: 400 });
  if (body.enabled) {
    const enabledFields = [['merchantBusinessId','Merchant business'],['originCity','Origin city'],['originState','Origin state']];
    for (const [field,label] of enabledFields) if (!String(body[field] || '').trim()) throw Object.assign(new Error(`${label} is required before Curfox can be enabled`), { status: 400 });
  }
}

router.get('/settings', adminAuth, async (req, res) => {
  try { const id = tenantId(req, res); if (!id) return; res.json(publicConfig(await configuration(id))); }
  catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/settings', adminAuth, async (req, res) => {
  try {
    const id = tenantId(req, res); if (!id) return;
    const current = await configuration(id);
    validateConfiguration(req.body, !current?.encryptedPassword?.ciphertext);
    const update = { provider: 'curfox', enabled: Boolean(req.body.enabled), courierTenant: req.body.courierTenant.trim(),
      merchantEmail: req.body.merchantEmail.trim(), merchantBusinessId: String(req.body.merchantBusinessId || '').trim(),
      originCity: String(req.body.originCity || '').trim(), originState: String(req.body.originState || '').trim(), defaultPackageWeight: Number(req.body.defaultPackageWeight),
      initialStatusKey: req.body.initialStatusKey, manualWaybillsEnabled: Boolean(req.body.manualWaybillsEnabled), updatedBy: req.user.email };
    Object.assign(update, optionalEncryptedSecret(req.body.password));
    if (update.enabled) {
      const validationConfig = current || new CourierIntegration({ tenantId:id, provider:'curfox' });
      Object.assign(validationConfig, update);
      if (!update.encryptedPassword && current?.encryptedPassword) validationConfig.encryptedPassword = current.encryptedPassword;
      const [businesses,cities] = await Promise.all([client.listBusinesses(id,validationConfig),client.listCities(id,validationConfig)]);
      if (!businesses.some(b=>String(b.id)===String(update.merchantBusinessId))) return res.status(400).json({message:'Select a merchant business returned by Curfox'});
      const originMatches=cities.filter(c=>String(c.name).trim().toLowerCase()===update.originCity.toLowerCase()&&String(c.state?.name||'').trim().toLowerCase()===update.originState.toLowerCase());
      if(originMatches.length!==1)return res.status(400).json({message:'Origin city/state must exactly match one canonical Curfox city and state'});
    }
    const saved = await CourierIntegration.findOneAndUpdate({ tenantId: id, provider: 'curfox' }, { $set: update }, { upsert: true, new: true, runValidators: true }).select(secretSelect);
    await DeliveryService.findOneAndUpdate({ tenantId: id, code: 'curfox' }, { $set: { code: 'curfox', name: 'Royal Express (Curfox)',
      description: 'Delivery through Royal Express', isEnabled: saved.enabled, codAllowed: true, estimatedDays: req.body.estimatedDays || '1-3 business days',
      rates: Array.isArray(req.body.rates) ? req.body.rates : undefined, updatedAt: new Date() } }, { upsert: true, new: true });
    client.clearTenantToken(id);
    res.json(publicConfig(saved));
  } catch (err) { const detail=err.providerError||{status:err.status||500,message:err.message};res.status(detail.status).json({ message: detail.message }); }
});

router.post('/test-connection', adminAuth, async (req, res) => {
  try {
    const id = tenantId(req, res); if (!id) return;
    let config = await configuration(id);
    if (!config) config = new CourierIntegration({ tenantId: id, provider: 'curfox' });
    for (const field of ['courierTenant','merchantEmail']) if (String(req.body[field] || '')) config[field] = String(req.body[field]).trim();
    if (String(req.body.password || '')) config.encryptedPassword = encryptSecret(req.body.password);
    if (!config.courierTenant || !config.merchantEmail || !config.encryptedPassword?.ciphertext) return res.status(400).json({ message: 'Courier tenant, merchant email, and password are required for connection testing' });
    await client.login(id, config, true);
    const businesses = await client.listBusinesses(id, config);
    res.json({ success: true, businesses });
  } catch (err) { const detail = err.providerError || { status: 500, message: err.message }; res.status(detail.status).json({ message: detail.message }); }
});

router.get('/businesses', adminAuth, async (req, res) => {
  try { const id = tenantId(req,res); if(!id)return; const config=await configuration(id); if(!config)return res.status(400).json({message:'Configure Curfox first'}); res.json(await client.listBusinesses(id,config)); }
  catch(err){const d=err.providerError||{status:500,message:err.message};res.status(d.status).json({message:d.message});}
});
router.get('/cities', adminAuth, async (req, res) => {
  try { const id=tenantId(req,res);if(!id)return;const config=await configuration(id);if(!config)return res.status(400).json({message:'Configure Curfox first'});const filters={};for(const key of ['filter[name]','filter[id]','filter[state_id]','filter[state_name]'])if(req.query[key])filters[key]=req.query[key];res.json(await client.listCities(id,config,filters)); }
  catch(err){const d=err.providerError||{status:500,message:err.message};res.status(d.status).json({message:d.message});}
});
router.get('/states', adminAuth, async (req, res) => {
  try { const id=tenantId(req,res);if(!id)return;const config=await configuration(id);if(!config)return res.status(400).json({message:'Configure Curfox first'});res.json(await client.listStates(id,config)); }
  catch(err){const d=err.providerError||{status:500,message:err.message};res.status(d.status).json({message:d.message});}
});

async function mappedOrder(id, order, config, overrides = {}) {
  const cities = await client.listCities(id, config);
  const ship = order.shipping?.street ? order.shipping : order.billing;
  const address = [ship?.street, ship?.city, ship?.country].filter(Boolean).join(', ');
  let destination = resolveDestinationCity(ship?.city, address, cities);
  if (destination.unresolved || destination.ambiguous) {
    if (!overrides.destinationCity || !overrides.destinationState) return { unresolved: destination, cities };
    const exact = cities.filter(c => String(c.name).trim().toLowerCase() === String(overrides.destinationCity).trim().toLowerCase()
      && String(c.state?.name).trim().toLowerCase() === String(overrides.destinationState).trim().toLowerCase());
    if (exact.length !== 1) return { unresolved: { unresolved: true }, cities };
    destination = { city: exact[0].name, state: exact[0].state.name, cityId: exact[0].id, stateId: exact[0].state.id };
  }
  const products = await Product.find({ tenantId: id, _id: { $in: order.items.map(i => i.product) } }).select('weight').lean();
  const weight = calculatePackageWeight(order.items, products, config.defaultPackageWeight, overrides.packageWeight);
  const primaryPhone = normalizeSriLankanPhone(ship?.phone || order.billing?.phone || order.guestInfo?.phone);
  let secondaryPhone = '';
  const secondaryCandidate = order.billing?.phone && order.billing.phone !== (ship?.phone || '') ? order.billing.phone : '';
  if (secondaryCandidate) secondaryPhone = normalizeSriLankanPhone(secondaryCandidate);
  const fullName = [ship?.firstName || order.billing?.firstName || order.guestInfo?.firstName, ship?.lastName || order.billing?.lastName || order.guestInfo?.lastName].filter(Boolean).join(' ').trim();
  const orderRow = { initial_status_key: config.initialStatusKey, order_no: order.orderNumber, customer_name: fullName,
    customer_address: address, customer_phone: primaryPhone, customer_secondary_phone: secondaryPhone || undefined,
    destination_city_name: destination.city, destination_state_name: destination.state,
    cod: curfoxCodAmount(order),
    description: order.items.map(i => `${i.name} x${i.quantity}`).join(', ').slice(0, 500), weight,
    remark: String(overrides.remark || order.notes || '').slice(0, 500) || undefined };
  const manualWaybill = String(overrides.waybillNumber || '').trim();
  applyManualWaybill(orderRow,config.manualWaybillsEnabled,manualWaybill);
  return { destination, weight, payload: { general_data: { merchant_business_id: config.merchantBusinessId,
    origin_city_name: config.originCity, origin_state_name: config.originState }, order_data: [orderRow] } };
}

router.get('/orders/:id/preview', adminAuth, async (req, res) => {
  try {
    const id=tenantId(req,res);if(!id)return;const config=await configuration(id);if(!config)return res.status(400).json({message:'Configure Curfox first'});
    const order=await Order.findOne({_id:req.params.id,tenantId:id});if(!order)return res.status(404).json({message:'Order not found'});
    const mapped=await mappedOrder(id,order,config,req.query);
    if(mapped.unresolved)return res.status(422).json({message:mapped.unresolved.ambiguous?'Multiple Curfox cities match; select the exact city and state.':'Destination city could not be matched. Select the canonical Curfox city and state.',resolution:mapped.unresolved,cities:mapped.cities});
    res.json({destination:mapped.destination,packageWeight:mapped.weight,cod:mapped.payload.order_data[0].cod,customerPhone:mapped.payload.order_data[0].customer_phone,manualWaybillsEnabled:config.manualWaybillsEnabled});
  } catch(err){const d=err.providerError||{status:400,message:err.message};res.status(d.status||400).json({message:d.message});}
});

router.post('/orders/:id/submit', adminAuth, async (req, res) => {
  const id=tenantId(req,res);if(!id)return;
  let submission;
  let providerCreateStarted=false;
  try {
    const order=await Order.findOne({_id:req.params.id,tenantId:id});
    if(!order)return res.status(404).json({message:'Order not found'});
    if(!canSubmitToCurfox(order))return res.status(409).json({message:String(order.deliveryService).toLowerCase()!=='curfox'?'This order did not select Curfox delivery':'Only Confirmed or Processing orders can be sent to Curfox'});
    const attemptId=crypto.randomUUID();
    const existing=await CourierSubmission.findOne({tenantId:id,orderId:order._id,provider:'curfox'});
    if(existing){
      if(existing.state!=='failed'||existing.externalId)return res.status(409).json({message:existing.state==='reconciliation_required'?'Curfox may have accepted this order but local reconciliation is required; do not submit again.':'This order has already been submitted or is currently submitting',submissionState:existing.state,externalId:existing.externalId||undefined});
      submission=await CourierSubmission.findOneAndUpdate({_id:existing._id,tenantId:id,state:'failed',externalId:''},{$set:{state:'submitting',attemptId,error:''}},{new:true});
      if(!submission)return res.status(409).json({message:'This order is already being submitted'});
    }else{
      try{submission=await CourierSubmission.create({tenantId:id,orderId:order._id,provider:'curfox',attemptId,state:'submitting'});}catch(err){if(err.code===11000)return res.status(409).json({message:'This order is already being submitted'});throw err;}
    }
    const claimed=await Order.findOneAndUpdate({_id:order._id,tenantId:id,'courier.submissionState':{$nin:['submitting','submitted']}},{$set:{'courier.provider':'curfox','courier.submissionState':'submitting','courier.submissionAttemptId':attemptId,'courier.submissionError':''}},{new:true});
    if(!claimed){await CourierSubmission.deleteOne({_id:submission._id,tenantId:id});return res.status(409).json({message:'This order is already being submitted'});}
    const config=await configuration(id);if(!config?.enabled)throw Object.assign(new Error('Curfox is not enabled for this store'),{status:400});
    const mapped=await mappedOrder(id,claimed,config,req.body);
    if(mapped.unresolved)throw Object.assign(new Error(mapped.unresolved.ambiguous?'Multiple Curfox cities match. Select the exact city and state.':'Destination city could not be matched. Select a Curfox city and state.'),{status:422,resolution:mapped.unresolved,cities:mapped.cities});
    const dryRun=String(process.env.CURFOX_DRY_RUN||'false').toLowerCase()==='true';
    let externalId='';let dryRunReference='';
    if(dryRun) dryRunReference=`DRYRUN-${claimed.orderNumber}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    else { providerCreateStarted=true;const response=await client.createOrder(id,config,mapped.payload); externalId=providerRows(response)[0]||response?.data?.[0]||''; if(!externalId)throw new Error('Curfox reported success without a waybill number'); }
    await CourierSubmission.findOneAndUpdate({_id:submission._id,tenantId:id},{$set:{state:'submitted',externalId:externalId||dryRunReference,dryRun,responseReceivedAt:new Date()}});
    const note=`Submitted to Curfox. ${dryRun?`Dry Run: ${dryRunReference}`:`Waybill: ${externalId}`}`;
    const history=claimed.orderStatus==='processing'?mergeCourierIntoProcessing(claimed.statusHistory,note,req.user.email):compactStatusHistory([...claimed.statusHistory.map(h=>h.toObject()),{status:claimed.orderStatus,note,updatedBy:req.user.email,updatedAt:new Date()}]);
    const update={$set:{statusHistory:history,deliveryPartner:'Curfox / Royal Express','courier.provider':'curfox','courier.submissionState':'submitted','courier.submittedAt':new Date(),'courier.externalId':externalId,'courier.waybill':externalId,'courier.dryRun':dryRun,'courier.dryRunReference':dryRunReference,'courier.destinationCity':mapped.destination.city,'courier.destinationState':mapped.destination.state,'courier.packageWeight':mapped.weight,'courier.manualWaybill':mapped.payload.order_data[0].waybill_number||'',...(externalId?{trackingNumber:externalId}:{})}};
    const saved=await Order.findOneAndUpdate({_id:claimed._id,tenantId:id,'courier.submissionAttemptId':attemptId},update,{new:true});
    if(!saved){await CourierSubmission.findOneAndUpdate({_id:submission._id,tenantId:id},{$set:{state:'reconciliation_required'}});return res.status(500).json({message:'Curfox accepted the order, but local saving failed. Reconciliation is required; do not submit again.'});}
    res.json(saved);
  } catch(err){
    const ambiguous=providerCreateStarted&&[503,504].includes(err?.providerError?.status);
    if(submission)await CourierSubmission.findOneAndUpdate({_id:submission._id,tenantId:id,state:'submitting'},{$set:{state:ambiguous?'reconciliation_required':'failed',error:err.message}}).catch(()=>{});
    await Order.findOneAndUpdate({_id:req.params.id,tenantId:id,'courier.submissionState':'submitting'},{$set:{'courier.submissionState':ambiguous?'reconciliation_required':'failed','courier.submissionError':err.message}}).catch(()=>{});
    const d=err.providerError||{status:err.status||500,message:err.message};res.status(d.status||500).json({message:ambiguous?`${d.message} The result is uncertain; reconcile with Royal Express before retrying.`:d.message,resolution:err.resolution,cities:err.cities});
  }
});

router.post('/orders/:id/reconcile', adminAuth, async (req,res)=>{
  try{
    const id=tenantId(req,res);if(!id)return;
    const order=await Order.findOne({_id:req.params.id,tenantId:id});if(!order)return res.status(404).json({message:'Order not found'});
    const submission=await CourierSubmission.findOne({tenantId:id,orderId:order._id,provider:'curfox'});
    if(!submission||submission.state!=='reconciliation_required')return res.status(409).json({message:'This order does not require reconciliation'});
    const externalId=String(submission.externalId||req.body.waybill||'').trim();
    if(!/^[A-Za-z0-9_-]{3,80}$/.test(externalId))return res.status(400).json({message:'Enter the real waybill verified in Royal Express'});
    submission.state='submitted';submission.externalId=externalId;submission.error='';await submission.save();
    const note=`Curfox submission reconciled. Waybill: ${externalId}`;
    const history=order.orderStatus==='processing'?mergeCourierIntoProcessing(order.statusHistory,note,req.user.email):compactStatusHistory([...order.statusHistory.map(h=>h.toObject()),{status:order.orderStatus,note,updatedBy:req.user.email,updatedAt:new Date()}]);
    const saved=await Order.findOneAndUpdate({_id:order._id,tenantId:id},{$set:{statusHistory:history,trackingNumber:externalId,deliveryPartner:'Curfox / Royal Express','courier.provider':'curfox','courier.externalId':externalId,'courier.waybill':externalId,'courier.submissionState':'submitted','courier.submissionError':'','courier.submittedAt':submission.responseReceivedAt||new Date(),'courier.dryRun':false}},{new:true});
    res.json(saved);
  }catch(err){res.status(500).json({message:err.message});}
});

async function refreshOne(id, order, config) {
  if(order.courier?.dryRun)throw Object.assign(new Error('Tracking is disabled for dry-run shipments'),{status:400});
  if(!['shipped','out_for_delivery'].includes(order.orderStatus))throw Object.assign(new Error('Tracking starts only after the local order is marked Shipped'),{status:409});
  const response=await client.tracking(id,config,order.courier.waybill||order.trackingNumber);
  const events=providerRows(response).map(row=>({status:row.status?.name||'',dateTime:row.date_time?new Date(row.date_time):undefined,dateTimeAgo:row.date_time_ago||'',user:[row.user?.first_name,row.user?.last_name].filter(Boolean).join(' ')})).sort((a,b)=>new Date(b.dateTime||0)-new Date(a.dateTime||0));
  const externalStatus=events[0]?.status||order.courier.externalStatus;
  const nextStatus=mapCurfoxStatus(externalStatus,order.orderStatus);
  const set={'courier.trackingEvents':events,'courier.externalStatus':externalStatus,'courier.lastSynchronizedAt':new Date()};
  if(nextStatus!==order.orderStatus){set.orderStatus=nextStatus;set.statusHistory=compactStatusHistory([...order.statusHistory.map(h=>h.toObject()),{status:nextStatus,note:`Curfox tracking: ${externalStatus}`,updatedBy:'Curfox sync',updatedAt:new Date()}]);if(nextStatus==='delivered')set.deliveredAt=new Date();}
  return Order.findOneAndUpdate({_id:order._id,tenantId:id},{$set:set},{new:true});
}

router.post('/orders/:id/refresh', adminAuth, async(req,res)=>{
  try{const id=tenantId(req,res);if(!id)return;const order=await Order.findOne({_id:req.params.id,tenantId:id});if(!order)return res.status(404).json({message:'Order not found'});const config=await configuration(id);if(!config)return res.status(400).json({message:'Configure Curfox first'});const updated=await refreshOne(id,order,config);if(order.orderStatus!=='delivered'&&updated?.orderStatus==='delivered'&&updated.billing?.email){const{sendMail,orderStatusUpdateHtml,isEmailEnabled}=require('../utils/mailer');if(await isEmailEnabled('order_status_customer'))sendMail({to:updated.billing.email,subject:`Order Update — ${updated.orderNumber}`,html:await orderStatusUpdateHtml(updated,'delivered','Delivered by Royal Express')}).catch(()=>{});}res.json(updated);}
  catch(err){const d=err.providerError||{status:err.status||500,message:err.message};res.status(d.status).json({message:d.message});}
});

module.exports = router;
module.exports.refreshOne = refreshOne;
module.exports.configuration = configuration;
module.exports.publicConfig = publicConfig;
module.exports.validateConfiguration = validateConfiguration;
