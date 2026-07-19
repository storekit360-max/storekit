'use strict';

const express = require('express');
const mongoose = require('mongoose');
const User = require('../../models/User');
const PlatformRole = require('../../models/PlatformRole');
const { requirePlatformPermission } = require('../../services/platformAuthorizationService');
const { requireRecentStepUp } = require('../../middleware/stepUp');
const PlatformAccountToken = require('../../models/PlatformAccountToken');
const AuthSession = require('../../models/AuthSession');
const AuthEvent = require('../../models/AuthEvent');
const MfaFactor = require('../../models/MfaFactor');
const accounts = require('../../services/platformAccountService');
const { sendMail } = require('../../utils/mailer');
const { revokeAllUserSessions } = require('../../services/authSessionService');

const router = express.Router();

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.get('/me', (req, res) => {
  res.json({
    user: { id: req.user._id, email: req.user.email },
    permissions: Array.from(req.platformPermissions || []).sort(),
    compatibilityOwner: !req.user.platformRoleIds?.length && process.env.REQUIRE_EXPLICIT_PLATFORM_ROLE !== 'true',
  });
});

router.get('/users', requirePlatformPermission('users.view'), async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 100);
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const filter = { role: 'superadmin', tenantId: null };
    if (req.query.status === 'active') filter.isActive = true;
    if (req.query.status === 'suspended') filter.isActive = false;
    if (req.query.search) {
      const search = escapeRegex(String(req.query.search).trim().slice(0, 100));
      filter.$or = [{ email: { $regex: search, $options: 'i' } }, { firstName: { $regex: search, $options: 'i' } }, { lastName: { $regex: search, $options: 'i' } }];
    }
    const [users, total] = await Promise.all([
      User.find(filter).select('-password -loginAttempts -lockUntil').populate('platformRoleIds', 'name slug active permissions').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      User.countDocuments(filter),
    ]);
    res.json({ users, page: { number: page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
});

router.put('/users/:id/roles', requirePlatformPermission('roles.manage'), requireRecentStepUp(), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid user identifier' });
    const roleIds = Array.from(new Set((req.body?.roleIds || []).map(String)));
    if (roleIds.some(id => !mongoose.isValidObjectId(id))) return res.status(400).json({ message: 'One or more role identifiers are invalid' });
    if (String(req.user._id) === req.params.id && roleIds.length === 0) {
      return res.status(400).json({ message: 'You cannot remove your own final platform role' });
    }
    const roles = await PlatformRole.find({ _id: { $in: roleIds }, active: true }).select('_id').lean();
    if (roles.length !== roleIds.length) return res.status(400).json({ message: 'One or more roles do not exist or are inactive' });
    const user = await User.findOne({ _id: req.params.id, role: 'superadmin', tenantId: null });
    if (!user) return res.status(404).json({ message: 'Platform user not found' });
    const oldValue = { platformRoleIds: user.platformRoleIds.map(String) };
    user.platformRoleIds = roleIds;
    await user.save();
    req.audit.set({ action: 'platform-user.roles.update', resource: 'platform-user', resourceId: String(user._id), changes: { oldValue, newValue: { platformRoleIds: roleIds } } });
    const updated = await User.findById(user._id).select('-password -loginAttempts -lockUntil').populate('platformRoleIds', 'name slug active permissions').lean();
    res.json(updated);
  } catch (error) { next(error); }
});

router.post('/users/invite', requirePlatformPermission('users.invite'), requireRecentStepUp(), async (req,res,next)=>{let created;try{const email=String(req.body?.email||'').toLowerCase().trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({message:'A valid email is required'});if(await User.exists({tenantId:null,email}))return res.status(409).json({message:'A platform user already uses this email'});const roleIds=Array.from(new Set((req.body.roleIds||[]).map(String)));if(!roleIds.length||roleIds.some(id=>!mongoose.isValidObjectId(id)))return res.status(400).json({message:'Select at least one valid platform role'});const roles=await PlatformRole.find({_id:{$in:roleIds},active:true}).select('_id');if(roles.length!==roleIds.length)return res.status(400).json({message:'One or more roles are missing or inactive'});await PlatformAccountToken.updateMany({email,type:'invite',usedAt:null},{$set:{usedAt:new Date()}});created=await accounts.createToken({type:'invite',email,roleIds,createdBy:req.user._id,ttlMinutes:48*60});const frontend=String(process.env.FRONTEND_URL||process.env.CLIENT_URL||'http://localhost:3000').replace(/\/$/,'');const link=`${frontend}/platform-account/${created.plainText}`;await sendMail({to:email,subject:'You are invited to the StoreKit Control Center',html:`<p>You were invited to join the StoreKit platform operations team.</p><p><a href="${accounts.escapeHtml(link)}">Accept this invitation</a></p><p>This single-use link expires in 48 hours. After accepting, sign in and enroll MFA.</p>`});req.audit.set({action:'platform-user.invite',resource:'platform-user-invitation',resourceId:String(created.token._id),metadata:{email,roleIds}});res.status(201).json({message:'Invitation sent',expiresAt:created.token.expiresAt});}catch(error){if(created?.token)await PlatformAccountToken.deleteOne({_id:created.token._id}).catch(()=>{});next(error);}});

router.get('/users/:id', requirePlatformPermission('users.view'), async(req,res,next)=>{try{if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:'Invalid user identifier'});const user=await User.findOne({_id:req.params.id,role:'superadmin',tenantId:null}).select('-password -loginAttempts').populate('platformRoleIds','name slug permissions').lean();if(!user)return res.status(404).json({message:'Platform user not found'});const[sessions,events,mfa]=await Promise.all([AuthSession.find({userId:user._id}).sort({lastSeenAt:-1}).limit(50).lean(),AuthEvent.find({userId:user._id}).sort({occurredAt:-1}).limit(100).lean(),MfaFactor.findOne({userId:user._id}).select('enabled enrolledAt lastUsedAt recoveryCodesRegeneratedAt').lean()]);res.json({user,sessions,events,mfa});}catch(error){next(error);}});

router.post('/users/:id/password-reset', requirePlatformPermission('users.edit'), requireRecentStepUp(), async(req,res,next)=>{let created;try{const user=await User.findOne({_id:req.params.id,role:'superadmin',tenantId:null});if(!user)return res.status(404).json({message:'Platform user not found'});await PlatformAccountToken.updateMany({userId:user._id,type:'password_reset',usedAt:null},{$set:{usedAt:new Date()}});created=await accounts.createToken({type:'password_reset',email:user.email,userId:user._id,createdBy:req.user._id,ttlMinutes:30});const frontend=String(process.env.FRONTEND_URL||process.env.CLIENT_URL||'http://localhost:3000').replace(/\/$/,'');const link=`${frontend}/platform-account/${created.plainText}`;await sendMail({to:user.email,subject:'StoreKit Control Center password reset',html:`<p>A platform operator initiated a password reset for your StoreKit account.</p><p><a href="${accounts.escapeHtml(link)}">Reset your password</a></p><p>This single-use link expires in 30 minutes. If you did not expect it, contact another platform owner.</p>`});req.audit.set({action:'platform-user.password-reset.request',resource:'platform-user',resourceId:String(user._id)});res.json({message:'Password reset link sent'});}catch(error){if(created?.token)await PlatformAccountToken.deleteOne({_id:created.token._id}).catch(()=>{});next(error);}});

router.post('/users/:id/mfa-reset', requirePlatformPermission('security.manage'), requireRecentStepUp(), async(req,res,next)=>{try{if(String(req.user._id)===req.params.id)return res.status(400).json({message:'Use your own MFA recovery flow instead of resetting your active factor'});const user=await User.findOne({_id:req.params.id,role:'superadmin',tenantId:null}).select('+tokenVersion');if(!user)return res.status(404).json({message:'Platform user not found'});const deleted=await MfaFactor.deleteOne({userId:user._id});user.tokenVersion=Number(user.tokenVersion||0)+1;user.mfaEnrollmentRequired=true;await user.save();const revoked=await revokeAllUserSessions(user._id,req.user._id,'MFA reset by platform operator');req.audit.set({action:'platform-user.mfa-reset',resource:'platform-user',resourceId:String(user._id),metadata:{factorDeleted:deleted.deletedCount,revokedSessions:revoked.modifiedCount}});res.json({message:'MFA enrollment cleared, all sessions revoked, and enrollment is required at next sign in'});}catch(error){next(error);}});

router.delete('/users/:id', requirePlatformPermission('users.delete'), requireRecentStepUp(), async(req,res,next)=>{try{if(String(req.user._id)===req.params.id)return res.status(400).json({message:'You cannot delete your own platform account'});const user=await User.findOne({_id:req.params.id,role:'superadmin',tenantId:null});if(!user)return res.status(404).json({message:'Platform user not found'});const remaining=await User.countDocuments({role:'superadmin',tenantId:null,isActive:true,_id:{$ne:user._id},'platformRoleIds.0':{$exists:true}});if(!remaining)return res.status(409).json({message:'Cannot delete the final active explicitly assigned platform operator'});await revokeAllUserSessions(user._id,req.user._id,'Platform account deleted');await Promise.all([MfaFactor.deleteMany({userId:user._id}),PlatformAccountToken.deleteMany({$or:[{userId:user._id},{email:user.email}]})]);await User.deleteOne({_id:user._id,role:'superadmin',tenantId:null});req.audit.set({action:'platform-user.delete',resource:'platform-user',resourceId:String(user._id),metadata:{email:user.email}});res.json({message:'Platform user deleted; historical audit and authentication events were retained'});}catch(error){next(error);}});

router.post('/users/:id/suspend', requirePlatformPermission('users.suspend'), requireRecentStepUp(), async (req, res, next) => {
  try {
    if (String(req.user._id) === req.params.id) return res.status(400).json({ message: 'You cannot suspend your own account' });
    const user = await User.findOne({ _id: req.params.id, role: 'superadmin', tenantId: null });
    if (!user) return res.status(404).json({ message: 'Platform user not found' });
    const oldValue = { isActive: user.isActive };
    user.isActive = false;
    user.tokenVersion = Number(user.tokenVersion || 0) + 1;
    await user.save();
    await revokeAllUserSessions(user._id, req.user._id, 'Platform account suspended');
    req.audit.set({ action: 'platform-user.suspend', resource: 'platform-user', resourceId: String(user._id), changes: { oldValue, newValue: { isActive: false } }, metadata: { reason: String(req.body?.reason || '').slice(0, 500) } });
    res.json({ message: 'Platform user suspended' });
  } catch (error) { next(error); }
});

router.post('/users/:id/reactivate', requirePlatformPermission('users.edit'), requireRecentStepUp(), async (req, res, next) => {
  try {
    const user = await User.findOneAndUpdate({ _id: req.params.id, role: 'superadmin', tenantId: null }, { $set: { isActive: true } }, { new: true, runValidators: true }).select('-password -loginAttempts -lockUntil').lean();
    if (!user) return res.status(404).json({ message: 'Platform user not found' });
    req.audit.set({ action: 'platform-user.reactivate', resource: 'platform-user', resourceId: String(user._id), changes: { newValue: { isActive: true } } });
    res.json(user);
  } catch (error) { next(error); }
});

module.exports = router;
