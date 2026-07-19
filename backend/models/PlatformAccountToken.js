'use strict';
const mongoose=require('mongoose');
const schema=new mongoose.Schema({type:{type:String,enum:['invite','password_reset'],required:true,index:true},tokenHash:{type:String,required:true,unique:true,select:false},email:{type:String,required:true,lowercase:true,trim:true,index:true},userId:{type:mongoose.Schema.Types.ObjectId,ref:'User',default:null},roleIds:[{type:mongoose.Schema.Types.ObjectId,ref:'PlatformRole'}],expiresAt:{type:Date,required:true,index:true},usedAt:{type:Date,default:null},createdBy:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true}},{timestamps:true});
schema.index({expiresAt:1},{expireAfterSeconds:30*24*60*60}); schema.index({email:1,type:1,usedAt:1,createdAt:-1});
module.exports=mongoose.models.PlatformAccountToken||mongoose.model('PlatformAccountToken',schema);
