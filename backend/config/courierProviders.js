'use strict';

module.exports = {
  koombiyo: {
    provider: 'koombiyo', displayName: 'Koombiyo',
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'password', secret: true, required: true },
      { key: 'accountId', label: 'Account ID', type: 'text', required: true },
    ], capabilities: ['test_connection', 'submit_order', 'tracking'],
  },
};
