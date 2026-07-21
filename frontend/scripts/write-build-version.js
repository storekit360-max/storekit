const fs = require('fs');
const path = require('path');

const version = String(
  process.env.RAILWAY_GIT_COMMIT_SHA ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  Date.now()
).trim();

const payload = JSON.stringify({ version, builtAt: new Date().toISOString() });
const buildDirectory = path.join(__dirname, '..', 'build');
if (!fs.existsSync(buildDirectory)) throw new Error('Frontend build directory does not exist');
fs.writeFileSync(path.join(buildDirectory, 'version.json'), `${payload}\n`, 'utf8');
process.stdout.write(`Frontend deployment version: ${version}\n`);
