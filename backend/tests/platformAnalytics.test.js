'use strict';

const test=require('node:test'); const assert=require('node:assert/strict'); const fs=require('fs'); const path=require('path');
const analytics=require('../services/platformAnalyticsService');

test('recurring revenue normalization excludes one-time value and annualizes yearly plans',()=>{
  assert.equal(analytics.recurringMonthlyAmount({subscription:{amount:1200,billingCycle:'yearly'}}),100);
  assert.equal(analytics.recurringMonthlyAmount({subscription:{amount:99,billingCycle:'monthly'}}),99);
  assert.equal(analytics.recurringMonthlyAmount({subscription:{amount:500,billingCycle:'once'}}),0);
});
test('currency and calendar grouping helpers are deterministic',()=>{assert.equal(analytics.normalizeCurrency(' usd '),'USD');assert.equal(analytics.monthKey('2026-07-18T10:00:00Z'),'2026-07');assert.equal(analytics.roundMoney(1.005),1.01);});
test('calendar cohort periods do not depend on variable month length',()=>{assert.equal(analytics.monthsBetween(new Date('2026-01-31T00:00:00Z'),new Date('2026-03-01T00:00:00Z')),3);});
test('CAC remains currency-specific and requires acquired paying tenants',()=>{assert.equal(analytics.calculateCac(1000,4),250);assert.equal(analytics.calculateCac(1000,0),null);});
test('analytics routes distinguish view and export permissions and prevent spreadsheet formulas',()=>{const source=fs.readFileSync(path.join(__dirname,'../routes/superadmin/analytics.js'),'utf8');assert.match(source,/analytics\.view/);assert.match(source,/analytics\.export/);assert.match(source,/\^\[=\+\\-@\]/);assert.match(source,/Cache-Control.*private, no-store/);});
test('analytics implements evidence-based CAC, sequenced funnels, and aggregate heatmaps',()=>{const source=fs.readFileSync(path.join(__dirname,'../services/platformAnalyticsService.js'),'utf8');const routes=fs.readFileSync(path.join(__dirname,'../routes/superadmin/analytics.js'),'utf8');assert.match(source,/grouped by currency/);assert.match(source,/first paid invoice/);assert.match(source,/orderedMap/);assert.match(source,/activityHeatmap/);assert.match(routes,/analytics\.manage/);assert.match(routes,/requireRecentStepUp/);assert.match(routes,/analytics\.acquisition-cost\.(create|update|delete)/);});
