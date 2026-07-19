'use strict';

const mongoose=require('mongoose');
const schema=new mongoose.Schema({
  name:{type:String,required:true,trim:true,maxlength:120},
  prefix:{type:String,required:true,unique:true,index:true,select:true},
  secretHash:{type:String,required:true,select:false},
  environment:{type:String,enum:['live','sandbox'],default:'live',index:true},
  scopes:{type:[String],default:[]},
  ipAllowlist:{type:[String],default:[]},
  rateLimitPerMinute:{type:Number,default:60,min:1,max:5000},
  expiresAt:{type:Date,default:null,index:true},
  lastUsedAt:{type:Date,default:null}, lastUsedIp:{type:String,default:''},
  revokedAt:{type:Date,default:null,index:true}, revokedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User',default:null},
  createdBy:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},
},{timestamps:true});
schema.index({environment:1,revokedAt:1,createdAt:-1});
module.exports=mongoose.models.PlatformApiKey||mongoose.model('PlatformApiKey',schema);
