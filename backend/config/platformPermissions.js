'use strict';

const groups = {
  platform: ['view', 'edit'],
  tenant: ['view', 'create', 'edit', 'suspend', 'impersonate', 'delete'],
  billing: ['view', 'update', 'refund'],
  analytics: ['view', 'export', 'manage'],
  users: ['view', 'invite', 'edit', 'suspend', 'delete'],
  roles: ['view', 'manage'],
  security: ['view', 'manage'],
  featureflags: ['view', 'manage'],
  support: ['view', 'reply', 'manage'],
  audit: ['view', 'export'],
  monitoring: ['view', 'manage'],
  notifications: ['view', 'manage', 'send'],
  infrastructure: ['view', 'manage'],
  developer: ['view', 'api', 'manage'],
  settings: ['view', 'manage'],
};

const definitions = Object.entries(groups).flatMap(([group, actions]) => actions.map(action => ({
  key: `${group}.${action}`,
  group,
  action,
  label: `${group.charAt(0).toUpperCase()}${group.slice(1)}: ${action}`,
  description: `Allows ${action} access to ${group}.`,
})));

const keys = definitions.map(item => item.key);

module.exports = { definitions, keys, groups };
