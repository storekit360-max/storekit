'use strict';

const mongoose=require('mongoose');
const schema=new mongoose.Schema({
  apiKey:{type:mongoose.Schema.Types.ObjectId,ref:'PlatformApiKey',required:true,index:true},
  environment:{type:String,enum:['live','sandbox'],required:true,index:true},
  occurredAt:{type:Date,default:Date.now,required:true},
  method:{type:String,required:true,maxlength:10}, endpoint:{type:String,required:true,maxlength:240,index:true},
  statusCode:{type:Number,required:true}, durationMs:{type:Number,required:true,min:0}, responseBytes:{type:Number,default:0,min:0},
  ip:{type:String,default:''}, correlationId:{type:String,default:'',index:true},
},{versionKey:false});
schema.index({apiKey:1,occurredAt:-1}); schema.index({occurredAt:1},{expireAfterSeconds:180*24*60*60});
module.exports=mongoose.models.ApiUsageEvent||mongoose.model('ApiUsageEvent',schema);
