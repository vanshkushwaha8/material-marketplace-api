/**
 * Standalone temp-upload cleanup — the production-grade way to run this
 * (an external cron / hosted scheduled task), rather than relying solely
 * on the in-process setInterval fallback in app.js (which doesn't survive
 * a restart's worth of missed runs and would double up if you ever run
 * multiple app instances).
 *
 * Usage:
 *   node src/scripts/cleanupTempUploads.js
 *
 * Suggested cron: every hour is more than enough given the default 24h
 * retention window —
 *   0 * * * *  cd /path/to/backend && node src/scripts/cleanupTempUploads.js >> /var/log/temp-cleanup.log 2>&1
 */

const { sweepOrphanedTempUploads, MAX_AGE_HOURS } = require('../src/service/upload/tempUploadCleanup.service');

async function run() {
  console.log(`Sweeping tempUploads for files older than ${MAX_AGE_HOURS}h...`);
  const result = await sweepOrphanedTempUploads();

  console.log(`Scanned: ${result.scanned}`);
  console.log(`Deleted: ${result.deleted} (${(result.deletedBytes / 1024 / 1024).toFixed(2)} MB freed)`);
  if (result.errors.length) {
    console.log(`Errors: ${result.errors.length}`);
    result.errors.forEach((e) => console.log(`  - ${e.file}: ${e.message}`));
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Cleanup failed:', err);
    process.exit(1);
  });
