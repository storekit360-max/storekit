'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const readFrontend = relative => fs.readFileSync(path.join(__dirname, '../../frontend/src', relative), 'utf8');

test('Super Admin modules are lazy loaded with resilient suspense boundaries', () => {
  const dashboard = readFrontend('pages/superadmin/SuperAdminDashboard.js');
  assert.ok((dashboard.match(/lazy\(\(\) => import\('\.\/SuperAdmin/g) || []).length >= 13);
  assert.doesNotMatch(dashboard, /import SuperAdminBilling from/);
  assert.match(dashboard, /<Suspense/);
  assert.match(dashboard, /<ModuleErrorBoundary resetKey=\{activeTab\}>/);
  const boundary = readFrontend('components/superadmin/ModuleErrorBoundary.js');
  assert.match(boundary, /getDerivedStateFromError/); assert.match(boundary, /componentDidCatch/); assert.match(boundary, /role="alert"/);
});

test('Control Center shell exposes landmarks, skip navigation, and mobile menu state', () => {
  const dashboard = readFrontend('pages/superadmin/SuperAdminDashboard.js');
  assert.match(dashboard, /href="#superadmin-main"/);
  assert.match(dashboard, /id="superadmin-main"/);
  assert.match(dashboard, /aria-label="Control Center navigation"/);
  assert.match(dashboard, /aria-controls="superadmin-navigation"/);
  assert.match(dashboard, /aria-expanded=\{sidebarOpen\}/);
  assert.match(dashboard, /aria-label="Close navigation menu"/);
});

test('modal infrastructure traps focus, restores focus, and locks background scroll', () => {
  const hook = readFrontend('hooks/useModalFocus.js');
  const palette = readFrontend('components/superadmin/CommandPalette.js');
  const integrations = readFrontend('pages/superadmin/SuperAdminIntegrations.js');
  assert.match(hook, /event\.key !== 'Tab'/); assert.match(hook, /event\.key === 'Escape'/); assert.match(hook, /previous\.focus\(\)/); assert.match(hook, /document\.body\.style\.overflow = 'hidden'/);
  assert.match(palette, /useModalFocus\(open, onClose\)/); assert.match(palette, /aria-autocomplete="list"/); assert.match(palette, /aria-label="Search the Control Center"/);
  assert.match(integrations, /role="dialog"/); assert.match(integrations, /aria-modal="true"/); assert.match(integrations, /Close integration configuration/);
});

test('high-density administration forms collapse safely on narrow viewports', () => {
  const flags = readFrontend('pages/superadmin/SuperAdminFeatureFlags.js');
  const support = readFrontend('pages/superadmin/SuperAdminSupportCenter.js');
  assert.ok((flags.match(/sm:grid-cols-2/g) || []).length >= 4); assert.match(flags, /sm:grid-cols-3/);
  assert.match(support, /aria-label="Ticket status"/); assert.match(support, /aria-label="Ticket priority"/); assert.match(support, /aria-label="Ticket assignee"/); assert.match(support, /grid gap-2 sm:grid-cols-2/);
});

test('high-density queues virtualize rows and table columns resize accessibly', () => {
  const virtualList = readFrontend('components/superadmin/VirtualList.js');
  const resizable = readFrontend('components/superadmin/ResizableHeader.js');
  const support = readFrontend('pages/superadmin/SuperAdminSupportCenter.js');
  const developer = readFrontend('pages/superadmin/SuperAdminDeveloperCenter.js');
  assert.match(virtualList, /Math\.floor\(scrollTop \/ itemHeight\)/);
  assert.match(virtualList, /items\.slice\(range\.start, range\.end\)/);
  assert.match(virtualList, /overscan = 5/);
  assert.match(virtualList, /role="list"/);
  assert.match(support, /<VirtualList items=\{tickets\}/);
  assert.match(support, /ariaLabel="Support ticket queue"/);
  assert.match(resizable, /role="separator"/);
  assert.match(resizable, /aria-valuemin="80"/);
  assert.match(resizable, /ArrowLeft.*ArrowRight/);
  assert.match(resizable, /localStorage\.setItem\(storageKey/);
  assert.match(developer, /<ResizableHeader/);
  assert.match(developer, /Reset widths/);
});
