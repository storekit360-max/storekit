'use strict';

/**
 * backupService.js  —  OAuth2 edition
 *
 * Uses the admin's real Google account (OAuth2) instead of a service account,
 * so backups land in your personal Google Drive with no quota issues.
 *
 * SETUP (one-time):
 * ─────────────────
 * 1. Go to https://console.cloud.google.com → APIs & Services → Credentials
 * 2. Create an OAuth 2.0 Client ID  (type: Web application)
 * 3. Add Authorised redirect URI:  https://<your-railway-domain>/api/backup/oauth/callback
 * 4. Copy Client ID + Client Secret into Railway env vars:
 *      GOOGLE_OAUTH_CLIENT_ID
 *      GOOGLE_OAUTH_CLIENT_SECRET
 *      GOOGLE_OAUTH_REDIRECT_URI
 * 5. In Backup Center → Settings → click "Connect Google Drive"
 *
 * npm install googleapis  (already installed)
 */

const path         = require('path');
const fs           = require('fs');
const os           = require('os');
const crypto       = require('crypto');
const { pipeline } = require('stream/promises');
const zlib         = require('zlib');

const mongoose     = require('mongoose');
const { google }   = require('googleapis');

const Backup         = require('../models/Backup');
const BackupSettings = require('../models/BackupSettings');
const { sendMail }   = require('../utils/mailer');

// ─── OAuth2 client ────────────────────────────────────────────────────────────
function getOAuthClient() {
  const clientId     = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri  = process.env.GOOGLE_OAUTH_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'Google OAuth not configured. Set GOOGLE_OAUTH_CLIENT_ID, ' +
      'GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_OAUTH_REDIRECT_URI in Railway env vars.'
    );
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

// ─── Generate the URL the admin visits once to authorise ──────────────────────
function getAuthUrl() {
  const oAuth2Client = getOAuthClient();
  return oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt:      'consent',
    scope:       ['https://www.googleapis.com/auth/drive.file'],
  });
}

// ─── Exchange auth code for tokens and persist refresh token ──────────────────
async function handleOAuthCallback(code) {
  const oAuth2Client = getOAuthClient();
  const { tokens }   = await oAuth2Client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      'No refresh_token received. In Google Cloud Console revoke existing access ' +
      'for this app and try again (prompt:consent forces a new one).'
    );
  }
  await BackupSettings.findByIdAndUpdate(
    'backup_settings',
    {
      oauthRefreshToken: tokens.refresh_token,
      oauthAccessToken:  tokens.access_token,
      oauthTokenExpiry:  tokens.expiry_date,
      oauthConnectedAt:  new Date(),
      oauthEmail:        null,
    },
    { upsert: true, new: true }
  );

  // Fetch connected account email for display
  try {
    oAuth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oAuth2Client });
    const info   = await oauth2.userinfo.get();
    await BackupSettings.findByIdAndUpdate('backup_settings', { oauthEmail: info.data.email });
  } catch {}

  return tokens;
}

// ─── Build an authenticated Drive client using stored tokens ──────────────────
async function getDriveClient() {
  const settings     = await getSettings();
  const refreshToken = settings.oauthRefreshToken;

  if (!refreshToken) {
    throw new Error(
      'Google Drive not connected. Go to Backup Center → Settings → Connect Google Drive.'
    );
  }

  const oAuth2Client = getOAuthClient();
  oAuth2Client.setCredentials({
    refresh_token: refreshToken,
    access_token:  settings.oauthAccessToken,
    expiry_date:   settings.oauthTokenExpiry,
  });

  // Persist new access token whenever it auto-refreshes
  oAuth2Client.on('tokens', async (tokens) => {
    const update = { oauthAccessToken: tokens.access_token, oauthTokenExpiry: tokens.expiry_date };
    if (tokens.refresh_token) update.oauthRefreshToken = tokens.refresh_token;
    await BackupSettings.findByIdAndUpdate('backup_settings', update).catch(() => {});
  });

  return google.drive({ version: 'v3', auth: oAuth2Client });
}

// ─── Ensure the backup folder exists in Drive (create if missing) ─────────────
async function ensureBackupFolder(drive, folderName) {
  const settings = await getSettings();
  const name     = folderName || settings.driveFolder || 'StoreKit Backups';

  // Check cached folder ID still exists
  if (settings.driveFolderId) {
    try {
      const f = await drive.files.get({ fileId: settings.driveFolderId, fields: 'id,trashed' });
      if (!f.data.trashed) return settings.driveFolderId;
    } catch {}
  }

  // Search for existing folder by name
  const res = await drive.files.list({
    q:      `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id,name)',
    spaces: 'drive',
  });

  if (res.data.files && res.data.files.length > 0) {
    const folderId = res.data.files[0].id;
    await BackupSettings.findByIdAndUpdate('backup_settings', { driveFolderId: folderId });
    return folderId;
  }

  // Create it
  const created = await drive.files.create({
    resource: { name, mimeType: 'application/vnd.google-apps.folder' },
    fields:   'id',
  });
  const folderId = created.data.id;
  await BackupSettings.findByIdAndUpdate('backup_settings', { driveFolderId: folderId });
  console.log(`[Backup] Created Drive folder "${name}" (${folderId})`);
  return folderId;
}

// ─── SHA-256 of a file ────────────────────────────────────────────────────────
async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash   = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', d => hash.update(d));
    stream.on('end',  () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

// ─── Dump one collection to NDJSON ───────────────────────────────────────────
async function dumpCollection(name) {
  const col  = mongoose.connection.collection(name);
  const docs = await col.find({}).toArray();
  return docs.map(d => JSON.stringify(d)).join('\n');
}

// ─── createBackup ─────────────────────────────────────────────────────────────
async function createBackup({ type = 'manual', label, triggeredBy = 'system' } = {}) {
  const record    = await Backup.create({ type, label: label || `${type} backup`, triggeredBy });
  const startedAt = Date.now();
  const tmpDir    = os.tmpdir();
  const archiveName = `storekit-backup-${record._id}.gz`;
  const archivePath = path.join(tmpDir, archiveName);

  try {
    // 1. Collect all collection names
    const collections = await mongoose.connection.db.listCollections().toArray();
    const colNames    = collections.map(c => c.name).filter(n => !n.startsWith('system.'));

    // 2. Build NDJSON envelope
    const lines = [];
    let totalDocs = 0;
    for (const name of colNames) {
      const dump  = await dumpCollection(name);
      const count = dump ? dump.split('\n').length : 0;
      totalDocs  += count;
      lines.push(`##COLLECTION:${name}:${count}`);
      if (dump) lines.push(dump);
    }
    const raw = lines.join('\n');

    // 3. Gzip to temp file
    await pipeline(
      require('stream').Readable.from([raw]),
      zlib.createGzip({ level: 6 }),
      fs.createWriteStream(archivePath),
    );

    const sizeBytes = fs.statSync(archivePath).size;
    const checksum  = await sha256File(archivePath);

    // 4. Upload to personal Google Drive
    const settings = await getSettings();
    const drive    = await getDriveClient();
    const folderId = await ensureBackupFolder(drive, settings.driveFolder);

    const uploadRes = await drive.files.create({
      resource: { name: archiveName, parents: [folderId] },
      media:    { mimeType: 'application/gzip', body: fs.createReadStream(archivePath) },
      fields:   'id,webViewLink',
    });

    const driveFileId  = uploadRes.data.id;
    const driveFileUrl = uploadRes.data.webViewLink;
    const duration     = Date.now() - startedAt;

    await Backup.findByIdAndUpdate(record._id, {
      status: 'completed',
      driveFileId,
      driveFileUrl,
      sizeBytes,
      checksum,
      collections: colNames,
      docCount: totalDocs,
      duration,
      completedAt: new Date(),
    });

    fs.unlinkSync(archivePath);
    await applyRetention(type);

    console.log(`[Backup] ✅ ${type} backup completed in ${duration}ms (${(sizeBytes/1024/1024).toFixed(2)} MB)`);
    return await Backup.findById(record._id);

  } catch (err) {
    console.error('[Backup] ❌ Backup failed:', err.message);
    try { if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath); } catch {}

    await Backup.findByIdAndUpdate(record._id, {
      status:      'failed',
      error:       err.message,
      duration:    Date.now() - startedAt,
      completedAt: new Date(),
    });

    const settings = await getSettings();
    if (settings.alertOnFailure && settings.alertEmail) {
      await sendMail({
        to:      settings.alertEmail,
        subject: `⚠️ StoreKit ${type} backup FAILED`,
        html:    `<p>Backup job <b>${type}</b> failed at ${new Date().toISOString()}.</p><p>Error: ${err.message}</p>`,
      }).catch(() => {});
    }
    throw err;
  }
}

// ─── verifyBackup ─────────────────────────────────────────────────────────────
async function verifyBackup(backupId) {
  const record = await Backup.findById(backupId);
  if (!record)             throw new Error('Backup not found');
  if (!record.driveFileId) throw new Error('No Drive file associated');

  const drive   = await getDriveClient();
  const tmpPath = path.join(os.tmpdir(), `verify-${backupId}.gz`);

  try {
    const dest = fs.createWriteStream(tmpPath);
    const res  = await drive.files.get(
      { fileId: record.driveFileId, alt: 'media' },
      { responseType: 'stream' }
    );
    await pipeline(res.data, dest);

    const dlChecksum = await sha256File(tmpPath);
    const ok         = dlChecksum === record.checksum;

    const raw = await new Promise((resolve, reject) => {
      const chunks = [];
      fs.createReadStream(tmpPath)
        .pipe(zlib.createGunzip())
        .on('data', c => chunks.push(c))
        .on('end',  () => resolve(Buffer.concat(chunks).toString('utf8')))
        .on('error', reject);
    });
    const foundCols = raw.split('\n')
      .filter(l => l.startsWith('##COLLECTION:'))
      .map(l => l.split(':')[1]);

    fs.unlinkSync(tmpPath);
    await Backup.findByIdAndUpdate(backupId, {
      status:     ok ? 'verified' : 'failed',
      verifiedAt: new Date(),
      error:      ok ? undefined : 'Checksum mismatch',
    });

    return { ok, checksum: dlChecksum, storedChecksum: record.checksum, collections: foundCols };
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch {}
    throw err;
  }
}

// ─── restoreBackup ────────────────────────────────────────────────────────────
async function restoreBackup(backupId) {
  const record = await Backup.findById(backupId);
  if (!record)             throw new Error('Backup not found');
  if (!record.driveFileId) throw new Error('No Drive file associated');

  const drive   = await getDriveClient();
  const tmpPath = path.join(os.tmpdir(), `restore-${backupId}.gz`);

  const dest = fs.createWriteStream(tmpPath);
  const res  = await drive.files.get(
    { fileId: record.driveFileId, alt: 'media' },
    { responseType: 'stream' }
  );
  await pipeline(res.data, dest);

  if (record.checksum) {
    const check = await sha256File(tmpPath);
    if (check !== record.checksum) {
      fs.unlinkSync(tmpPath);
      throw new Error('Checksum mismatch — restore aborted');
    }
  }

  const raw = await new Promise((resolve, reject) => {
    const chunks = [];
    fs.createReadStream(tmpPath)
      .pipe(zlib.createGunzip())
      .on('data', c => chunks.push(c))
      .on('end',  () => resolve(Buffer.concat(chunks).toString('utf8')))
      .on('error', reject);
  });
  fs.unlinkSync(tmpPath);

  const sections = {};
  let current = null;
  for (const line of raw.split('\n')) {
    if (line.startsWith('##COLLECTION:')) {
      current = line.split(':')[1];
      sections[current] = [];
    } else if (current && line.trim()) {
      try { sections[current].push(JSON.parse(line)); } catch {}
    }
  }

  for (const [colName, docs] of Object.entries(sections)) {
    if (!docs.length) continue;
    const col      = mongoose.connection.collection(colName);
    await col.deleteMany({});
    const prepared = docs.map(d => {
      try {
        if (d._id && typeof d._id === 'string') d._id = new mongoose.Types.ObjectId(d._id);
      } catch {}
      return d;
    });
    await col.insertMany(prepared, { ordered: false });
  }

  console.log(`[Backup] ✅ Restore from ${backupId} completed — ${Object.keys(sections).length} collections`);
  return { collections: Object.keys(sections) };
}

// ─── applyRetention ───────────────────────────────────────────────────────────
async function applyRetention(type) {
  const settings = await getSettings();
  const limits   = { daily: settings.retainDaily, weekly: settings.retainWeekly, monthly: settings.retainMonthly, manual: 50 };
  const limit    = limits[type] || 20;

  const old = await Backup.find({ type, status: { $in: ['completed', 'verified'] } })
    .sort({ createdAt: -1 })
    .skip(limit)
    .select('_id driveFileId');

  if (!old.length) return;

  const drive = await getDriveClient();
  for (const b of old) {
    try {
      if (b.driveFileId) await drive.files.delete({ fileId: b.driveFileId });
    } catch {}
    await Backup.findByIdAndDelete(b._id);
  }
  console.log(`[Backup] Retention: deleted ${old.length} old ${type} backups`);
}

// ─── driveStorageInfo ─────────────────────────────────────────────────────────
async function driveStorageInfo() {
  const drive    = await getDriveClient();
  const settings = await getSettings();

  const about = await drive.about.get({ fields: 'storageQuota,user' });
  const quota  = about.data.storageQuota || {};
  const email  = about.data.user?.emailAddress || settings.oauthEmail || '';

  let backupBytes = 0;
  let fileCount   = 0;
  if (settings.driveFolderId) {
    let pageToken = null;
    do {
      const res = await drive.files.list({
        q:        `'${settings.driveFolderId}' in parents and trashed=false`,
        fields:   'nextPageToken,files(size)',
        pageSize: 100,
        ...(pageToken ? { pageToken } : {}),
      });
      for (const f of res.data.files || []) {
        backupBytes += parseInt(f.size || 0, 10);
        fileCount++;
      }
      pageToken = res.data.nextPageToken;
    } while (pageToken);
  }

  return {
    configured:  true,
    oauthMode:   true,
    email,
    usedBytes:   parseInt(quota.usage        || 0, 10),
    totalBytes:  parseInt(quota.limit        || 0, 10),
    inDrive:     parseInt(quota.usageInDrive || 0, 10),
    backupBytes,
    fileCount,
    folderName:  settings.driveFolder || 'StoreKit Backups',
  };
}

// ─── getSettings (singleton) ──────────────────────────────────────────────────
async function getSettings() {
  let s = await BackupSettings.findById('backup_settings');
  if (!s) s = await BackupSettings.create({ _id: 'backup_settings' });
  return s;
}

// ─── getHealth ────────────────────────────────────────────────────────────────
async function getHealth() {
  const [latest, failed24h, settings] = await Promise.all([
    Backup.findOne({ status: { $in: ['completed', 'verified'] } }).sort({ createdAt: -1 }),
    Backup.countDocuments({ status: 'failed', createdAt: { $gte: new Date(Date.now() - 86400000) } }),
    getSettings(),
  ]);

  const hoursSinceLast = latest
    ? Math.round((Date.now() - new Date(latest.createdAt).getTime()) / 3600000)
    : null;

  return {
    status:         failed24h > 0 ? 'warning' : hoursSinceLast == null ? 'unknown' : hoursSinceLast > 26 ? 'stale' : 'healthy',
    latestBackup:   latest,
    failed24h,
    hoursSinceLast,
    settings,
    driveConnected: !!settings.oauthRefreshToken,
    oauthEmail:     settings.oauthEmail || null,
  };
}

module.exports = {
  createBackup,
  verifyBackup,
  restoreBackup,
  applyRetention,
  driveStorageInfo,
  getSettings,
  getHealth,
  getDriveClient,
  getAuthUrl,
  handleOAuthCallback,
};