'use strict';

const express = require('express');
const paypalBilling = require('../services/paypalBillingService');
const router = express.Router();

router.post('/webhook', async (req, res, next) => {
  try {
    const verified = await paypalBilling.verifyWebhook(req.headers, req.body || {});
    if (!verified) return res.status(400).json({ message: 'Invalid PayPal webhook signature' });
    const result = await paypalBilling.handleWebhook(req.body || {});
    res.json({ received: true, ...result });
  } catch (error) { next(error); }
});

module.exports = router;
