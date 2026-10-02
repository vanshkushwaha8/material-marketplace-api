const express = require('express');
const adminMiddleWare = require("../../middleware/admin.middleware");
const userConsentController = require("../../controller/admin/userconsent.controller");
const { authapiLimiter } = require("../../utils/rateLimiter.utils");

const { authorize } = require('../../middleware/authorize.middleware');
const { ADMIN_PERMISSIONS: A } = require('../../constants/rbac.constants');
const router = express.Router();

router.post("/userconsent/add", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare,authorize(A.LEGAL_DOCUMENT_MANAGE), userConsentController.add);
router.post("/userconsent/update", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare,authorize(A.LEGAL_DOCUMENT_MANAGE), userConsentController.update);
router.delete("/userconsent/delete", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare,authorize(A.LEGAL_DOCUMENT_MANAGE), userConsentController.delete);
router.patch("/userconsent/status", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare,authorize(A.LEGAL_DOCUMENT_MANAGE), userConsentController.status);
router.get("/userconsent/get", authapiLimiter({ windowMs: 15 * 60 * 1000, max: 300 }), adminMiddleWare, authorize(A.LEGAL_DOCUMENT_READ),userConsentController.getAll);

module.exports = router;