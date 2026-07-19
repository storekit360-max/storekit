'use strict';

const providers = [
  { key: 'stripe', label: 'Stripe', category: 'billing', configFields: ['portalReturnUrl'], secretFields: ['secretKey'], env: { secretKey: 'STRIPE_SECRET_KEY', portalReturnUrl: 'STRIPE_PORTAL_RETURN_URL' }, testMode: 'remote' },
  { key: 'cloudinary', label: 'Cloudinary', category: 'storage', configFields: ['cloudName'], secretFields: ['apiKey', 'apiSecret'], env: { cloudName: 'CLOUDINARY_CLOUD_NAME', apiKey: 'CLOUDINARY_API_KEY', apiSecret: 'CLOUDINARY_API_SECRET' }, testMode: 'remote' },
  { key: 'resend', label: 'Resend', category: 'email', configFields: ['fromAddress'], secretFields: ['apiKey'], env: { apiKey: 'RESEND_API_KEY', fromAddress: 'EMAIL_FROM' }, testMode: 'remote' },
  { key: 'smtp', label: 'SMTP', category: 'email', configFields: ['host', 'port', 'secure', 'username', 'fromAddress'], secretFields: ['password'], env: { host: 'EMAIL_HOST', port: 'EMAIL_PORT', username: 'EMAIL_USER', password: 'EMAIL_PASS', fromAddress: 'EMAIL_FROM' }, testMode: 'remote' },
  { key: 'google-oauth', label: 'Google OAuth', category: 'identity', configFields: ['clientId'], secretFields: ['clientSecret'], env: { clientId: 'GOOGLE_OAUTH_CLIENT_ID', clientSecret: 'GOOGLE_OAUTH_CLIENT_SECRET' }, testMode: 'configuration' },
  { key: 'meta-capi', label: 'Meta Conversions API', category: 'marketing', configFields: ['pixelId', 'graphVersion'], secretFields: ['accessToken'], env: { pixelId: 'META_PIXEL_ID', graphVersion: 'META_GRAPH_VERSION', accessToken: 'META_CAPI_ACCESS_TOKEN' }, testMode: 'remote' },
  { key: 'meta-ads', label: 'Meta Ads Insights', category: 'marketing', configFields: ['adAccountId', 'graphVersion'], secretFields: ['accessToken'], env: { adAccountId: 'META_AD_ACCOUNT_ID', graphVersion: 'META_ADS_GRAPH_VERSION', accessToken: 'META_ADS_ACCESS_TOKEN' }, testMode: 'remote' },
  { key: 'google-ads', label: 'Google Ads Reporting', category: 'marketing', configFields: ['clientId', 'customerId', 'loginCustomerId', 'apiVersion'], secretFields: ['clientSecret', 'refreshToken', 'developerToken'], env: { clientId: 'GOOGLE_ADS_CLIENT_ID', customerId: 'GOOGLE_ADS_CUSTOMER_ID', loginCustomerId: 'GOOGLE_ADS_LOGIN_CUSTOMER_ID', apiVersion: 'GOOGLE_ADS_API_VERSION', clientSecret: 'GOOGLE_ADS_CLIENT_SECRET', refreshToken: 'GOOGLE_ADS_REFRESH_TOKEN', developerToken: 'GOOGLE_ADS_DEVELOPER_TOKEN' }, testMode: 'remote' },
  { key: 'openrouter', label: 'OpenRouter', category: 'ai', configFields: ['model'], secretFields: ['apiKey'], env: { model: 'OPENROUTER_TEXT_MODEL', apiKey: 'OPENROUTER_API_KEY' }, testMode: 'remote' },
  { key: 'gemini', label: 'Google Gemini', category: 'ai', configFields: ['model'], secretFields: ['apiKey'], env: { model: 'GEMINI_TEXT_MODEL', apiKey: 'GEMINI_API_KEY' }, testMode: 'remote' },
  { key: 'anthropic', label: 'Anthropic', category: 'ai', configFields: ['model'], secretFields: ['apiKey'], env: { model: 'ANTHROPIC_MODEL', apiKey: 'ANTHROPIC_API_KEY' }, testMode: 'remote' },
  { key: 'pexels', label: 'Pexels', category: 'media', configFields: [], secretFields: ['apiKey'], env: { apiKey: 'PEXELS_API_KEY' }, testMode: 'remote' },
  { key: 'slack', label: 'Slack Notifications', category: 'notifications', configFields: [], secretFields: ['webhookUrl'], env: { webhookUrl: 'SLACK_WEBHOOK_URL' }, testMode: 'remote' },
  { key: 'twilio', label: 'Twilio SMS', category: 'notifications', configFields: ['accountSid', 'fromNumber'], secretFields: ['authToken'], env: { accountSid: 'TWILIO_ACCOUNT_SID', fromNumber: 'TWILIO_FROM_NUMBER', authToken: 'TWILIO_AUTH_TOKEN' }, testMode: 'remote' },
  { key: 'notification-webhook', label: 'Notification Webhook', category: 'notifications', configFields: ['endpoint'], secretFields: ['signingSecret'], env: { endpoint: 'NOTIFICATION_WEBHOOK_URL', signingSecret: 'NOTIFICATION_WEBHOOK_SIGNING_SECRET' }, testMode: 'configuration' },
  { key: 'push-gateway', label: 'Push Gateway', category: 'notifications', configFields: ['endpoint'], secretFields: ['apiKey'], env: { endpoint: 'PUSH_GATEWAY_URL', apiKey: 'PUSH_GATEWAY_API_KEY' }, testMode: 'configuration' },
];

const byKey = new Map(providers.map(provider => [provider.key, provider]));
module.exports = { providers, byKey };
