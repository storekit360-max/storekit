'use strict';

function databaseName(uri) {
  try { return new URL(uri).pathname.replace(/^\//, '').split('?')[0]; }
  catch (_) { return ''; }
}

function assertSafeStagingDatabase(env = process.env) {
  if (String(env.APP_ENV || '').toLowerCase() !== 'staging') return true;
  const name = databaseName(env.MONGODB_URI || '');
  if (!/(staging|stage|test|local)/i.test(name)) {
    throw new Error(`STAGING SAFETY: refusing database "${name || '(missing)'}"; the database name must contain staging, stage, test, or local`);
  }
  return true;
}

module.exports = { databaseName, assertSafeStagingDatabase };
