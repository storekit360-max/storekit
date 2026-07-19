'use strict';
const crypto=require('crypto'); const WebhookEvent=require('../models/WebhookEvent');
function payloadDigest(payload){const value=Buffer.isBuffer(payload)?payload:Buffer.from(typeof payload==='string'?payload:JSON.stringify(payload||{}));return crypto.createHash('sha256').update(value).digest('hex');}
async function record(input){return WebhookEvent.findOneAndUpdate({provider:input.provider,eventId:input.eventId,direction:input.direction},{$set:{...input,payloadDigest:input.payloadDigest||payloadDigest(input.payload),payload:undefined}},{upsert:true,new:true,setDefaultsOnInsert:true});}
module.exports={payloadDigest,record};
