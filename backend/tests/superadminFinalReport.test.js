'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const permissionRegistry = require('../config/platformPermissions');

const root = path.join(__dirname, '..', '..');
const reportPath = path.join(root, 'docs/SUPER_ADMIN_COMPLETE_IMPLEMENTATION_REPORT.md');

function routeDeclarationCount() {
  const modularDir = path.join(root, 'backend/routes/superadmin');
  const files = fs.readdirSync(modularDir).filter(file => file.endsWith('.js')).map(file => path.join(modularDir, file));
  files.push(path.join(root, 'backend/routes/superadmin.js'));
  return files.reduce((total, file) => total + Array.from(fs.readFileSync(file, 'utf8').matchAll(/router\.(get|post|put|patch|delete)\(\s*['`]([^'`]+)/g)).length, 0);
}

test('complete implementation report contains every requested final artifact', () => {
  const report = fs.readFileSync(reportPath, 'utf8');
  for (const heading of [
    'Architecture diagram', 'Database diagram', 'Permission matrix', 'Feature matrix', 'API inventory',
    'UI screen inventory', 'Deployment notes', 'Security checklist', 'Performance checklist', 'Testing checklist',
    'Production readiness score', 'Code quality score', 'Remaining recommendations',
  ]) assert.match(report, new RegExp(`## ${heading}`));
  assert.ok((report.match(/```mermaid/g) || []).length >= 2);
  assert.match(report, /conditional hold/i);
  assert.match(report, /not certification/i);
});

test('reported source inventory stays synchronized with routes, models, permissions, and screens', () => {
  const report = fs.readFileSync(reportPath, 'utf8');
  const models = fs.readdirSync(path.join(root, 'backend/models')).filter(file => file.endsWith('.js') && file !== 'index.js').length;
  const pages = fs.readdirSync(path.join(root, 'frontend/src/pages/superadmin')).filter(file => file.endsWith('.js')).length;
  const tests = fs.readdirSync(path.join(root, 'backend/tests')).filter(file => file.endsWith('.test.js')).length;
  assert.match(report, new RegExp(`Private Super Admin endpoint declarations \\| ${routeDeclarationCount()} \\|`));
  assert.match(report, new RegExp(`Registered dynamic permissions \\| ${permissionRegistry.keys.length} across`));
  assert.match(report, new RegExp(`Backend model files excluding the model barrel \\| ${models} \\|`));
  assert.match(report, new RegExp(`Dedicated Super Admin page files \\| ${pages} \\|`));
  assert.match(report, new RegExp(`Backend test files \\| ${tests} \\|`));
});

test('readiness scoring is reproducible and never represented as production approval', () => {
  const report = fs.readFileSync(reportPath, 'utf8');
  const scoreSection = report.slice(report.indexOf('## Production readiness score'), report.indexOf('## Code quality score'));
  const readiness = [...scoreSection.matchAll(/^\| [^|]+ \| (\d+) \| (\d+) \|/gm)];
  assert.equal(readiness.reduce((sum, match) => sum + Number(match[1]), 0), 100);
  assert.equal(readiness.reduce((sum, match) => sum + Number(match[2]), 0), 69);
  assert.match(report, /Not approved for production until mandatory gates pass/);
  assert.doesNotMatch(report, /100% guarantee/i);
});
