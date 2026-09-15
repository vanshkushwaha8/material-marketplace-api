const twofaService = require('../../service/app/twofa.service');
const responseConstants = require('../../constants/response.constatnts');
const statusCodes = require('../../constants/httpConstants');
const adminModel = require('../../model/admin.model');
const otpModel = require('../../model/otp.model');
const CollectionName = require("../../constants/auditLogcollection.constant");
const configenv = require('../../config/env.config');
const { createAuditLogAdmin } = require('../../helper/audit.helper');
const TwofaModel = require('../../model/twofa.model');
const auditLogConstants = require("../../constants/auditLogConstants");
const authService = require('../../service/admin/auth.service');
const { setAdminAuthCookie } = require('../../helper/authCookie');
const sessionModel = require('../../model/session.model');
const helper = require('../../helper/helper');

const getClientIp = (req) =>
  req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
  req.socket?.remoteAddress ||
  req.ip;

class TwofaController {
  provisionTotp = async (req, res, next) => {
    try {
      const result = await twofaService.provisionTotp(req.auth);
      await createAuditLogAdmin({
        req: req,
        adminId: req?.auth?._id,
        action: auditLogConstants.TWOFA_TOTP_PROVISIONED,
        entity: CollectionName.admins,
        entityId: req?.auth?._id,
        metadata: {
          updateType: "TOTP_PROVISIONED",
          method: "TOTP"
        }
      });
      return responseConstants.success(res, '2FA provisioned. Scan the QR code or enter the key manually.', result, statusCodes.OK);
    } catch (err) {
      next(err)
    }
  };

  verifyTotpSetup = async (req, res, next) => {
    try {
      const { tempSecret, token } = req.body;
      if (!tempSecret || !token) {
        return responseConstants.BadRequest(res, 'tempSecret and token are required.', null, statusCodes.OK);
      }
      const userId = req.auth._id;
      const result = await twofaService.verifyTotpSetup(userId, tempSecret, token);
      await createAuditLogAdmin({
        req: req,
        adminId: req?.auth?._id,
        action: auditLogConstants.TWOFA_TOTP_VERIFIED,
        entity: CollectionName.admins,
        entityId: userId,
      });
      return responseConstants.success(res, 'TOTP verified. Save your recovery codes — they will not be shown again.', result, statusCodes.OK);
    } catch (err) {
      next(err)
    }
  };
  initiateEmailSetup = async (req, res, next) => {
    try {
      var { email } = req.body;
      email = req?.auth?.email
      const result = await twofaService.initiateEmailSetup(req.auth._id, email, otpModel);
      await createAuditLogAdmin({
        req: req,
        adminId: req?.auth?._id,
        action: auditLogConstants.TWOFA_INITIAL_EMAIL_SETUP,
        entity: CollectionName.admins,
        entityId: req?.auth?._id,

      });
      return responseConstants.success(res, result.message, null, statusCodes.OK);
    } catch (err) {
      next(err)
    }
  };
  verifyEmailSetup = async (req, res, next) => {
    try {
      var { email, otp } = req.body;
      if (!otp) {
        return responseConstants.BadRequest(res, 'otp are required.', null, statusCodes.OK);
      }
      email = req?.auth?.email
      otp = otp?.trim().toLowerCase();
      const userId = req.auth._id;
      const result = await twofaService.verifyEmailSetup(userId, email, otp, otpModel);
      const twofa = await TwofaModel.findOne({ userId });
      await createAuditLogAdmin({
        req,
        adminId: userId,
        action: auditLogConstants.TWOFA_EMAIL_FALLBACK_SETUP,
        entity: CollectionName.admins,
        entityId: userId,
      });
      return responseConstants.success(res, 'Email fallback 2FA verified. Save your recovery codes — they will not be shown again.', result, statusCodes.OK);
    } catch (err) {
      next(err)
    }
  };

  acknowledgeRecoveryCodes = async (req, res, next) => {
    try {
      if (req.body.acknowledged !== true) {
        return responseConstants.BadRequest(res, 'You must confirm you have saved your recovery codes.', null, statusCodes.BAD_REQUEST);
      }
      const userId = req.auth._id;
      const result = await twofaService.acknowledgeRecoveryCodes(userId, adminModel);
      await createAuditLogAdmin({
        req, adminId: userId, action: auditLogConstants.TWOFA_ENABLED, entity: CollectionName.admins,
        entityId: userId,
      });
      return responseConstants.success(res, '2FA is now enabled on your account.', result, statusCodes.OK);
    } catch (err) {
      next(err)
    }
  };


  switchMethod = async (req, res, next) => {
    try {
      const { method } = req.body;
      if (!method) {
        return responseConstants.BadRequest(res, 'method is required.', null, statusCodes.BAD_REQUEST);
      }
      const userId = req.auth._id;
      const result = await twofaService.switchMethod(userId, method);
      await createAuditLogAdmin({
        req: req, adminId: req?.auth?._id, action: auditLogConstants.TWOFA_METHOD_SWITCH, entity: CollectionName.admins, entityId: userId, metadata: {
          updateType: "METHOD_SWITCHED",
          method: method
        }
      })
      return responseConstants.success(res, `Active 2FA method switched to ${result.activeMethod}.`, result, statusCodes.OK);
    } catch (err) {
      next(err)
    }
  };

  sendLoginEmailOtp = async (req, res, next) => {
    try {
      const { pendingToken } = req.body;
      if (!pendingToken) {
        return responseConstants.BadRequest(res, 'pendingToken is required.', null, statusCodes.BAD_REQUEST);
      }
      const jwt = require('jsonwebtoken');
      const secret = configenv.PENDING_TOKEN_SECRET || 'pending_secret_change_me';
      let payload;
      try {
        payload = jwt.verify(pendingToken, secret);
      } catch {
        return responseConstants.Forbidden(res, 'Session expired. Please log in again.', null, statusCodes.OK);
      }
      const result = await twofaService.sendLoginEmailOtp(payload.sub, otpModel);
      return responseConstants.success(res, result.message, null, statusCodes.OK);
    } catch (err) {
      next(err)
    }
  };

  verifyLoginFactor = async (req, res, next) => {
    try {
      const { pendingToken, otp } = req.body;
      if (!pendingToken || !otp) {
        return responseConstants.BadRequest(res, 'pendingToken and otp are required.', null, statusCodes.OK);
      }
      const userId = await twofaService.verifyLoginFactor(pendingToken, otp, otpModel);
      const userData = await adminModel.findById(userId);
      if (!userData) {
        return responseConstants.Forbidden(res, 'User not found.', null, statusCodes.OK);
      }
      const sessionData = await authService.login(userData);
      const ipAddress = getClientIp(req);
      const hashToken = await helper.hashToken(sessionData.token);
      await sessionModel.create({ adminId: userId, token: hashToken, ipAddress });
      await createAuditLogAdmin({ req, adminId: userId, action: auditLogConstants.TWOFA_LOGIN, entity:CollectionName.admins, entityId: userId });
      setAdminAuthCookie(res, sessionData.token);
      const { token, ...sessionDataWithoutToken } = sessionData;
      return responseConstants.success(res, `Welcome back, ${userData.fullName}!`, {
        ...sessionDataWithoutToken,
      }, statusCodes.OK);
    } catch (err) {
      next(err)
    }
  };
  verifyLoginWithRecoveryCode = async (req, res, next) => {
    try {
      const { pendingToken, recoveryCode } = req.body;
      if (!pendingToken || !recoveryCode) {
        return responseConstants.BadRequest(res, 'pendingToken and recoveryCode are required.', null, statusCodes.BAD_REQUEST);
      }
      const userId = await twofaService.verifyLoginWithRecoveryCode(pendingToken, recoveryCode);
      const userData = await adminModel.findById(userId);
      if (!userData) {
        return responseConstants.Forbidden(res, 'User not found.', null, statusCodes.BAD_REQUEST);
      }
      const sessionData = await authService.login(userData);
      const ipAddress = getClientIp(req);
      const hashToken = await helper.hashToken(sessionData.token);
      await sessionModel.create({ adminId: userId, token: hashToken, ipAddress });
      await createAuditLogAdmin({ req, adminId: userId, action: auditLogConstants.TWOFA_RECOVERY_LOGIN, entity:CollectionName.admins, entityId: userId });
      setAdminAuthCookie(res, sessionData.token);
      const { token, ...sessionDataWithoutToken } = sessionData;
      return responseConstants.success(res, 'Logged in via recovery code. Please review your 2FA settings.', { ...sessionDataWithoutToken, }, statusCodes.OK);
    } catch (err) {
      next(err)
    }
  };
  regenerateRecoveryCodes = async (req, res, next) => {
    try {
      const { otp } = req.body;
      if (!otp) {
        return responseConstants.BadRequest(res, 'Current 2FA code is required to regenerate recovery codes.', null, statusCodes.OK);
      }
      const userId = req.auth._id;
      const result = await twofaService.regenerateRecoveryCodes(userId, otp, otpModel);
      await createAuditLogAdmin({ req, adminId: userId, action: auditLogConstants.TWOFA_RECOVERY_REGENERATED, entity: CollectionName.admins, entityId:userId });
      return responseConstants.success(res, 'Recovery codes regenerated. Save these now — they will not be shown again.', result, statusCodes.OK);
    } catch (err) {
      next(err)
    }
  };
  getStatus = async (req, res, next) => {
    try {
      const result = await twofaService.getStatus(req.auth._id);
      return responseConstants.success(res, '2FA status retrieved.', result, statusCodes.OK);
    } catch (err) {
      next(err);
    }
  };
  initiateDisable2FA = async (req, res, next) => {
    try {
      const userId = req.auth._id;
      const result = await twofaService.initiateDisable2FA(userId, otpModel);
      await createAuditLogAdmin({ req, adminId: userId, action: auditLogConstants.TWOFA_DISABLE_INITIATED, entity: CollectionName.admins, entityId:userId })
      return responseConstants.success(res, result.message || 'Proceed with your authenticator code to disable 2FA.', result, statusCodes.OK);
    } catch (err) {
      next(err)
    }
  };

  confirmDisable2FA = async (req, res, next) => {
    try {
      const { otp } = req.body;
      if (!otp) {
        return responseConstants.BadRequest(res, 'Your current 2FA code is required to disable 2FA.', null, statusCodes.OK);
      }
      const userId = req.auth._id;
      const result = await twofaService.confirmDisable2FA(userId, otp, otpModel, adminModel);
      await createAuditLogAdmin({ req, adminId: userId, action: auditLogConstants.TWOFA_DISABLED, entity: 'User', entityId: userId });
      return responseConstants.success(res, '2FA has been disabled on your account.', result, statusCodes.OK);
    } catch (err) {
      next(err)
    }
  };
}

module.exports = new TwofaController();