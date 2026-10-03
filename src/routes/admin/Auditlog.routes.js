const express = require('express');
const adminMiddleWare = require("../../middleware/admin.middleware");
const auditLogController = require("../../controller/admin/auditLog.controller");
const auditLogBulkExportController = require("../../controller/admin/auditLog/auditLogBulkExport.controller");
const { authapiLimiter } = require("../../utils/rateLimiter.utils");
const { authorize } = require('../../middleware/authorize.middleware');
const { ADMIN_PERMISSIONS: A } = require('../../constants/rbac.constants');
const router = express.Router();

router.get("/auditlog/get", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare, authorize(A.AUDIT_LOG_READ), auditLogController.get);
router.get("/auditlog/getActionOptions", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare, authorize(A.AUDIT_LOG_READ), auditLogController.getActionOptions);
router.get("/auditlog/getRoleOptions", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare, authorize(A.AUDIT_LOG_READ), auditLogController.getRoleOptions);
// Exports take the data off-platform — a separate permission from viewing.
router.get("/auditlog/export", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 30 }), adminMiddleWare, authorize(A.AUDIT_LOG_READ, A.AUDIT_LOG_EXPORT), auditLogController.export);
router.post("/auditlog/bulk-export", authapiLimiter({ windowMs: 60 * 60 * 1000, max: 5 }), adminMiddleWare, authorize(A.AUDIT_LOG_READ, A.AUDIT_LOG_EXPORT), auditLogBulkExportController.createJob);
router.get("/auditlog/bulk-export/:jobId", authapiLimiter({ windowMs: 60 * 1000, max: 120 }), adminMiddleWare, authorize(A.AUDIT_LOG_READ, A.AUDIT_LOG_EXPORT), auditLogBulkExportController.getStatus);
router.get("/auditlog/bulk-export/:jobId/download", authapiLimiter({ windowMs: 60 * 60 * 1000, max: 20 }), adminMiddleWare, authorize(A.AUDIT_LOG_READ, A.AUDIT_LOG_EXPORT), auditLogBulkExportController.download);

module.exports = router;
