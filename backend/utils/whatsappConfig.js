'use strict';

function normalizeWhatsappNumber(value, country = 'Sri Lanka') {
  let digits = String(value || '').trim().replace(/[\s().-]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (!/^\d+$/.test(digits)) return '';

  const isSriLanka = /sri\s*lanka|\blk\b/i.test(String(country || 'Sri Lanka'));
  if (isSriLanka) {
    if (/^0\d{9}$/.test(digits)) digits = `94${digits.slice(1)}`;
    else if (/^\d{9}$/.test(digits)) digits = `94${digits}`;
  }

  return /^\d{8,15}$/.test(digits) ? digits : '';
}

function defaultWhatsappConfig(number, storeName = 'Support Team', country = 'Sri Lanka') {
  const normalized = normalizeWhatsappNumber(number, country);
  if (!normalized) return {};
  return {
    whatsappEnabled: true,
    whatsappNumber: `+${normalized}`,
    whatsappWelcomeMessage: `Hi there 👋 Welcome to ${storeName}! How can we help you today?`,
    whatsappPrefilledMessage: "Hi! I'd like to know more about your products.",
    whatsappAgentName: `${storeName} Support`,
    whatsappButtonPosition: 'bottom-right',
    whatsappOnlineHours: { start: '09:00', end: '18:00' },
    whatsappOfflineMessage: "We're currently offline but will reply as soon as possible.",
    whatsappShowOnMobile: true,
    whatsappShowOnDesktop: true,
  };
}

module.exports = { defaultWhatsappConfig, normalizeWhatsappNumber };
