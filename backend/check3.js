require('dotenv').config();
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const PublishLog = require('./models/PublishLog');
  const logs = await PublishLog.find({ platform: 'facebook' }).sort({ createdAt: -1 }).limit(5);
  console.log('Facebook publish logs found:', logs.length);
  if (!logs.length) {
    console.log('NO LOGS - dispatchForTrigger was never called');
    console.log('Reason: automation rule was not enabled when product was added');
  }
  logs.forEach(l => {
    console.log('---');
    console.log('status:', l.status);
    console.log('product:', l.entityName);
    console.log('error:', l.errorMessage);
    console.log('code:', l.errorCode);
    console.log('time:', l.createdAt);
  });
  mongoose.disconnect();
}).catch(e => { console.error(e.message); process.exit(1); });
