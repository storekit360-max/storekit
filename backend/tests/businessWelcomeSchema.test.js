const test = require('node:test');
const assert = require('node:assert/strict');
const Tenant = require('../models/Tenant');

test('tenant schema retains multi-business welcome configuration', () => {
  const tenant = new Tenant({
    storeName: 'Example Brand',
    settings: {
      businessWelcomeEnabled: true,
      businessWelcomeTitle: 'Choose a store',
      businessWelcomeStores: [
        { name: 'Fashion', url: 'https://fashion.example.com', buttonLabel: 'Shop fashion' },
        { name: 'Home', url: '/shop', buttonLabel: 'Shop home' },
      ],
    },
  });
  const settings = tenant.toObject().settings;
  assert.equal(settings.businessWelcomeEnabled, true);
  assert.equal(settings.businessWelcomeStores.length, 2);
  assert.equal(settings.businessWelcomeStores[0].name, 'Fashion');
  assert.equal(settings.businessWelcomeStores[1].url, '/shop');
});
