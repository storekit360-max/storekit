'use strict';

/**
 * backupScheduler.js
 *
 * Runs a polling loop every minute to check whether a daily, weekly, or
 * monthly backup is due.  This avoids a hard dependency on node-cron or
 * any external scheduler — the same pattern used by tokenRefreshScheduler.js.
 *
 * Call startBackupScheduler() once from server.js after DB connects.
 */

const { createBackup, getSettings } = require('./backupService');

let _timer = null;

async function tick() {
  try {
    const settings = await getSettings();
    if (!settings.enabled) return;

    const now = new Date();
    const h   = now.getUTCHours();
    const d   = now.getUTCDate();
    const dow = now.getUTCDay(); // 0=Sun

    // ── Daily ───────────────────────────────────────────────────────────────
    if (h === settings.dailyHour) {
      const last = settings.lastDaily;
      const todayMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      if (!last || new Date(last) < todayMidnight) {
        console.log('[BackupScheduler] Starting daily backup…');
        await getSettings().then(s =>
          s.updateOne({ lastDaily: new Date() })
        );
        createBackup({ type: 'daily', triggeredBy: 'scheduler' }).catch(e =>
          console.error('[BackupScheduler] Daily backup error:', e.message)
        );
      }
    }

    // ── Weekly ──────────────────────────────────────────────────────────────
    if (dow === settings.weeklyDay && h === settings.weeklyHour) {
      const last = settings.lastWeekly;
      const thisWeekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dow));
      if (!last || new Date(last) < thisWeekStart) {
        console.log('[BackupScheduler] Starting weekly backup…');
        await getSettings().then(s =>
          s.updateOne({ lastWeekly: new Date() })
        );
        createBackup({ type: 'weekly', triggeredBy: 'scheduler' }).catch(e =>
          console.error('[BackupScheduler] Weekly backup error:', e.message)
        );
      }
    }

    // ── Monthly ─────────────────────────────────────────────────────────────
    if (d === settings.monthlyDay && h === settings.monthlyHour) {
      const last = settings.lastMonthly;
      const thisMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      if (!last || new Date(last) < thisMonthStart) {
        console.log('[BackupScheduler] Starting monthly backup…');
        await getSettings().then(s =>
          s.updateOne({ lastMonthly: new Date() })
        );
        createBackup({ type: 'monthly', triggeredBy: 'scheduler' }).catch(e =>
          console.error('[BackupScheduler] Monthly backup error:', e.message)
        );
      }
    }

  } catch (err) {
    console.error('[BackupScheduler] Tick error:', err.message);
  }
}

function startBackupScheduler() {
  if (_timer) return;
  // Run once immediately (catches up on restarts), then every 60 s
  tick();
  _timer = setInterval(tick, 60 * 1000);
  console.log('✅ Backup scheduler started');
}

function stopBackupScheduler() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

module.exports = { startBackupScheduler, stopBackupScheduler };