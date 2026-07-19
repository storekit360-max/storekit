'use strict';

const mongoose=require('mongoose');
const schema=new mongoose.Schema({
  direction:{type:String,enum:['inbound','outbound'],required:true,index:true}, provider:{type:String,required:true,index:true},
  eventId:{type:String,default:undefined,trim:true}, eventType:{type:String,required:true,index:true},
  tenantId:{type:mongoose.Schema.Types.ObjectId,ref:'Tenant',default:null,index:true},
  status:{type:String,enum:['received','processing','succeeded','failed','rejected'],required:true,index:true},
  httpStatus:{type:Number,default:null}, attempts:{type:Number,default:1,min:0}, durationMs:{type:Number,default:0,min:0},
  payloadDigest:{type:String,required:true}, correlationId:{type:String,default:'',index:true},
  error:{type:String,default:'',maxlength:1000}, receivedAt:{type:Date,default:Date.now}, processedAt:{type:Date,default:null},
  deliveryId:{type:mongoose.Schema.Types.ObjectId,ref:'NotificationDelivery',default:null},
},{timestamps:true});
schema.index({provider:1,eventId:1,direction:1},{unique:true,sparse:true}); schema.index({status:1,createdAt:-1});
module.exports=mongoose.models.WebhookEvent||mongoose.model('WebhookEvent',schema);
