require('dotenv').config();
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const SocialMedia = require('./models/SocialMedia');
  const doc = await SocialMedia.findOne();
  const fb = doc && doc.facebook;
  if (!fb) { console.log('NO FACEBOOK CONFIG IN DB'); mongoose.disconnect(); return; }
  console.log('connected:', fb.connected);
  console.log('enabled:', fb.enabled);
  console.log('accountId (Page ID):', fb.accountId);
  console.log('hasAccessToken:', fb.accessToken && fb.accessToken.length > 0);
  console.log('lastTestStatus:', fb.lastTestStatus);
  console.log('lastTestMessage:', fb.lastTestMessage);
  mongoose.disconnect();
}).catch(e => { console.error(e.message); process.exit(1); });
