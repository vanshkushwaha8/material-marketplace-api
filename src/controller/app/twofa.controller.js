const twofaService = require('../../service/app/twofa.service');
const responseConstants = require('../../constants/response.constatnts');
const statusCodes = require('../../constants/httpConstants');
const userModel = require('../../model/user.model');
const CollectionName = require("../../constants/auditLogcollection.constant");
const otpModel = require('../../model/otp.model');
const configenv = require('../../config/env.config');
const { createAuditLog } = require('../../helper/audit.helper');
const auditLogConstants = require("../../constants/auditLogConstants");
const authService = require('../../service/app/auth.service');
const { setAuthCookie } = require('../../helper/authCookie');

class TwofaController {
  provisionTotp = async (req, res, next) => {
    try {
      const result = await twofaService.provisionTotp(req.auth);
      await createAuditLog({ req: req, userId: req?.auth?._id, action: auditLogConstants.TWOFA_TOTP_PROVISIONED, entity: CollectionName?.users, entityId: req?.auth?._id, });
      return responseConstants.success(
        res,
        '2FA provisioned. Scan the QR code or enter the key manually.',
        result,
        statusCodes.OK
      );
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
      await createAuditLog({ req: req, userId: req?.auth?._id, action: auditLogConstants.TWOFA_TOTP_VERIFIED, entity: CollectionName?.users, entityId: req?.auth?._id, });
      return responseConstants.success(
        res,
        'TOTP verified. Save your recovery codes — they will not be shown again.',
        result,
        statusCodes.OK
      );
    } catch (err) {
      next(err)
    }
  };
  initiateEmailSetup = async (req, res, next) => {
    try {
      var { email } = req.body;
      email = req?.auth?.email
      const result = await twofaService.initiateEmailSetup(req.auth._id, email, otpModel);
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
      otp = otp?.trim().toLowerCase()
      const userId = req.auth._id;
      const result = await twofaService.verifyEmailSetup(userId, email, otp, otpModel);

      await createAuditLog({ req, userId, action: auditLogConstants.TWOFA_EMAIL_FALLBACK_SETUP, entity: CollectionName?.users, entityId: userId });
      return responseConstants.success(
        res,
        'Email fallback 2FA verified. Save your recovery codes — they will not be shown again.',
        result,
        statusCodes.OK
      );
    } catch (err) {
      next(err)
    }
  };

  acknowledgeRecoveryCodes = async (req, res, next) => {
    try {
      if (req.body.acknowledged !== true) {
        return responseConstants.BadRequest(
          res,
          'You must confirm you have saved your recovery codes.',
          null,
          statusCodes.BAD_REQUEST
        );
      }
      const userId = req.auth._id;
      const result = await twofaService.acknowledgeRecoveryCodes(userId, userModel);

      await createAuditLog({ req, userId, action: auditLogConstants.TWOFA_ENABLED, entity: CollectionName?.users, entityId: userId });
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
      await createAuditLog({ req: req, userId: req?.auth?._id, action: auditLogConstants.TWOFA_METHOD_SWITCH, entity: CollectionName?.users, entityId: req?.auth?._id, })
      return responseConstants.success(
        res,
        `Active 2FA method switched to ${result.activeMethod}.`,
        result,
        statusCodes.OK
      );
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
      const userData = await userModel.findById(userId);
      if (!userData) {
        return responseConstants.Forbidden(res, 'User not found.', null, statusCodes.OK);
      }
      const consentStatus = await authService.checkConsentUpdates(userData);
      const sessionData = await authService.login(
        { headers: req.headers, socket: req.socket, ip: req.ip },
        userData
      );
      await createAuditLog({ req, userId, action: auditLogConstants.TWOFA_LOGIN, entity: CollectionName?.users, entityId: userId });
      if (consentStatus.needConsentUpdate) {
        await createAuditLog({ req, userId, action: auditLogConstants.CONSENT_UPDATE_REQUIRED, entity: CollectionName?.users, entityId: userId });
      }
      setAuthCookie(res, sessionData.token);
      const { token, ...sessionDataWithoutToken } = sessionData;
      return responseConstants.success(res, `Welcome back, ${userData.fullName}!`, {
        ...sessionDataWithoutToken,
        needConsentUpdate: consentStatus.needConsentUpdate,
        updatedDocuments: consentStatus.updatedDocuments
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
      const userData = await userModel.findById(userId);
      if (!userData) {
        return responseConstants.Forbidden(res, 'User not found.', null, statusCodes.BAD_REQUEST);
      }

      const consentStatus = await authService.checkConsentUpdates(userData);

      const sessionData = await authService.login(
        { headers: req.headers, socket: req.socket, ip: req.ip },
        userData
      );

      await createAuditLog({ req, userId, action: auditLogConstants.TWOFA_RECOVERY_LOGIN, entity: CollectionName?.users, entityId: userId });
      if (consentStatus.needConsentUpdate) {
        await createAuditLog({ req, userId, action: auditLogConstants.CONSENT_UPDATE_REQUIRED, entity: CollectionName?.users, entityId: userId });
      }
      setAuthCookie(res, sessionData.token);
      const { token, ...sessionDataWithoutToken } = sessionData;
      return responseConstants.success(
        res,
        'Logged in via recovery code. Please review your 2FA settings.',
        {
          ...sessionDataWithoutToken,
          needConsentUpdate: consentStatus.needConsentUpdate,
          updatedDocuments: consentStatus.updatedDocuments
        },
        statusCodes.OK
      );
    } catch (err) {
      next(err)
    }
  };
  regenerateRecoveryCodes = async (req, res, next) => {
    try {
      const { otp } = req.body;
      if (!otp) {
        return responseConstants.BadRequest(
          res,
          'Current 2FA code is required to regenerate recovery codes.',
          null,
          statusCodes.OK
        );
      }

      const userId = req.auth._id;
      const result = await twofaService.regenerateRecoveryCodes(userId, otp, otpModel);

      await createAuditLog({ req, userId, action: auditLogConstants.TWOFA_RECOVERY_REGENERATED, entity: CollectionName?.users, entityId: userId });
      return responseConstants.success(
        res,
        'Recovery codes regenerated. Save these now — they will not be shown again.',
        result,
        statusCodes.OK
      );
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

      await createAuditLog({ req, userId, action: auditLogConstants.TWOFA_DISABLE_INITIATED, entity: CollectionName?.users, entityId: userId });
      return responseConstants.success(
        res,
        result.message || 'Proceed with your authenticator code to disable 2FA.',
        result,
        statusCodes.OK
      );
    } catch (err) {
      next(err)
    }
  };

  confirmDisable2FA = async (req, res, next) => {
    try {
      const { otp } = req.body;
      if (!otp) {
        return responseConstants.BadRequest(
          res,
          'Your current 2FA code is required to disable 2FA.',
          null,
          statusCodes.OK
        );
      }

      const userId = req.auth._id;
      const result = await twofaService.confirmDisable2FA(userId, otp, otpModel, userModel);

      await createAuditLog({ req, userId, action: auditLogConstants.TWOFA_DISABLED, entity: CollectionName?.users, entityId: userId });
      return responseConstants.success(
        res,
        '2FA has been disabled on your account.',
        result,
        statusCodes.OK
      );
    } catch (err) {
      next(err)
    }
  };
}

module.exports = new TwofaController();