const express = require('express');
const adminMiddleWare = require("../../middleware/admin.middleware");
const permissionMiddleware = require("../../middleware/permission.middleware");
const PERMISSIONSCONSTANTS = require("../../constants/permission.constant")
const auditLogController = require("../../controller/admin/auditLog.controller");
const auditLogBulkExportController = require("../../controller/admin/auditLog/auditLogBulkExport.controller");
const { authapiLimiter } = require("../../utils/rateLimiter.utils");
const router = express.Router();
router.get("/auditlog/get", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare,  permissionMiddleware(PERMISSIONSCONSTANTS.AUDITLOG.AUDIT_LOG_VIEW), auditLogController.get);
router.get("/auditlog/getActionOptions", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare,  permissionMiddleware(PERMISSIONSCONSTANTS.AUDITLOG.AUDIT_LOG_VIEW), auditLogController.getActionOptions);
router.get("/auditlog/getRoleOptions", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare,  permissionMiddleware(PERMISSIONSCONSTANTS.AUDITLOG.AUDIT_LOG_VIEW), auditLogController.getRoleOptions);
router.get("/auditlog/export", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 30 }), adminMiddleWare,  permissionMiddleware(PERMISSIONSCONSTANTS.AUDITLOG.AUDIT_LOG_VIEW), auditLogController.export);
router.post(
  "/auditlog/bulk-export",
  authapiLimiter({ windowMs: 60 * 60 * 1000, max: 5 }),
  adminMiddleWare,
  permissionMiddleware(PERMISSIONSCONSTANTS.AUDITLOG.AUDIT_LOG_VIEW),
  auditLogBulkExportController.createJob
);
router.get(
  "/auditlog/bulk-export/:jobId",
  authapiLimiter({ windowMs: 60 * 1000, max: 120 }),
  adminMiddleWare,

  permissionMiddleware(PERMISSIONSCONSTANTS.AUDITLOG.AUDIT_LOG_VIEW),
  auditLogBulkExportController.getStatus
);
router.get(
  "/auditlog/bulk-export/:jobId/download",
  authapiLimiter({ windowMs: 60 * 60 * 1000, max: 20 }),
  adminMiddleWare,

  permissionMiddleware(PERMISSIONSCONSTANTS.AUDITLOG.AUDIT_LOG_VIEW),
  permissionMiddleware(PERMISSIONSCONSTANTS.AUDITLOG.AUDIT_LOG_BULK_EXPORT),
  auditLogBulkExportController.download
);

module.exports = router;