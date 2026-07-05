require('dotenv').config();
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const AutomationRule = require('./models/AutomationRule');
  const rules = await AutomationRule.find();
  console.log('RULES IN DB:', rules.length);
  rules.forEach(r => {
    console.log('---');
    console.log('trigger:', r.trigger);
    console.log('enabled:', r.enabled);
    console.log('platforms:', JSON.stringify(r.platforms));
  });
  if (!rules.length) console.log('NO RULES FOUND - visit Admin > Automation tab first');
  mongoose.disconnect();
}).catch(e => { console.error(e.message); process.exit(1); });
