/**
 * Run on an external scheduler (cron/k8s CronJob) in production, e.g.:
 *   0 * * * *  node src/scripts/cleanupAuditLogExports.js
 * The in-process sweep (AUDIT_EXPORT_CLEANUP_INTERVAL_MS in app.js) is a
 * convenience for local/single-instance use only — see the comment there.
 * This script connects, runs one cleanup pass, and exits, which is the
 * right shape for an external scheduler rather than a long-lived interval.
 */
require('dotenv').config();
const connectDB = require('../src/config/db');
const { cleanupExpiredExports } = require('../src/service/admin/auditLog/auditLogBulkExport.service');

(async () => {
  try {
    await connectDB();
    const deletedCount = await cleanupExpiredExports();
    console.log(`Audit log export cleanup: removed ${deletedCount} expired file(s).`);
    process.exit(0);
  } catch (err) {
    console.error('Audit log export cleanup failed:', err.message);
    process.exit(1);
  }
})();
