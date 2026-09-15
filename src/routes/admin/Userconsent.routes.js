const express = require('express');
const adminMiddleWare = require("../../middleware/admin.middleware");
const userConsentController = require("../../controller/admin/userconsent.controller");
const { authapiLimiter } = require("../../utils/rateLimiter.utils");

const permissionMiddleware = require("../../middleware/permission.middleware");
const PERMISSIONSCONSTANTS = require('../../constants/permission.constant');
const router = express.Router();

router.post("/userconsent/add", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare,permissionMiddleware(PERMISSIONSCONSTANTS.LEGALDOCUMENT.LEGAL_DOCUMENT_ADD), userConsentController.add);
router.post("/userconsent/update", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare,permissionMiddleware(PERMISSIONSCONSTANTS.LEGALDOCUMENT.LEGAL_DOCUMENT_EDIT), userConsentController.update);
router.delete("/userconsent/delete", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare,permissionMiddleware(PERMISSIONSCONSTANTS.LEGALDOCUMENT.LEGAL_DOCUMENT_DELETE), userConsentController.delete);
router.get("/userconsent/status", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare,permissionMiddleware(PERMISSIONSCONSTANTS.LEGALDOCUMENT.LEGAL_DOCUMENT_STATUS_CHANGE), userConsentController.status);
router.get("/userconsent/get", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare, permissionMiddleware(PERMISSIONSCONSTANTS.LEGALDOCUMENT.LEGAL_DOCUMENT_VIEW),userConsentController.getAll);

module.exports = router;