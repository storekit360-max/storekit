'use strict';
const mongoose=require('mongoose');
const schema=new mongoose.Schema({apiKey:{type:mongoose.Schema.Types.ObjectId,ref:'PlatformApiKey',required:true},bucket:{type:Date,required:true},count:{type:Number,default:0,min:0},expiresAt:{type:Date,required:true}},{versionKey:false});
schema.index({apiKey:1,bucket:1},{unique:true}); schema.index({expiresAt:1},{expireAfterSeconds:0});
module.exports=mongoose.models.ApiRateLimitBucket||mongoose.model('ApiRateLimitBucket',schema);
