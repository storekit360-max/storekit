'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const SocialMedia = require('../models/SocialMedia');
const SocialSchedule = require('../models/SocialSchedule');
const SocialPostDraft = require('../models/SocialPostDraft');
const ScheduledSocialPost = require('../models/ScheduledSocialPost');
const SocialPublishAttempt = require('../models/SocialPublishAttempt');
const PublishLog = require('../models/PublishLog');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const duplicates = await SocialMedia.aggregate([
    { $match: { tenantId: { $type: 'objectId' } } },
    { $group: { _id: '$tenantId', count: { $sum: 1 }, ids: { $push: '$_id' } } },
    { $match: { count: { $gt: 1 } } },
  ]);
  console.log(JSON.stringify({ mode: process.argv.includes('--apply') ? 'apply' : 'audit', duplicateSocialSettingsTenants: duplicates }, null, 2));
  if (duplicates.length) {
    throw new Error('Resolve duplicate SocialMedia documents per tenant manually before creating the unique tenant index. No data was changed.');
  }
  if (!process.argv.includes('--apply')) {
    console.log('Audit complete. Re-run with --apply to create missing indexes without dropping existing indexes.');
    return;
  }
  for (const model of [SocialMedia, SocialSchedule, SocialPostDraft, ScheduledSocialPost, SocialPublishAttempt, PublishLog]) {
    const created = await model.createIndexes();
    console.log(`${model.modelName}: ${JSON.stringify(created)}`);
  }
  console.log('Social scheduling indexes created. Existing products and publish logs were not modified.');
}

main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
