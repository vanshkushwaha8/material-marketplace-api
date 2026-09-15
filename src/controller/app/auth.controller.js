const helper = require("../../helper/helper");
const { setAuthCookie, clearAuthCookie } = require("../../helper/authCookie");
const { createAuditLog } = require("../../helper/audit.helper");
const CollectionName = require("../../constants/auditLogcollection.constant");
const auditLogConstants = require("../../constants/auditLogConstants")
const statusCodes = require("../../constants/httpConstants")
const responseConstants = require("../../constants/response.constatnts");
const userModel = require("../../model/user.model");
const authService = require("../../service/app/auth.service");
const authValidation = require("../../validation/app/auth.validation");
const messageConstants = require("../../constants/message.constants");
const verificationModel = require('../../model/verification.model');
const deleteConstants = require("../../constants/delete.constants");
const otpModel = require("../../model/otp.model");
const { OAuth2Client } = require("google-auth-library");
const sessionModel = require("../../model/session.model");
const configenv = require("../../config/env.config");
const TwofaModel = require("../../model/twofa.model");
const twofaService = require("../../service/app/twofa.service");
const statusConstants = require("../../constants/status.constants");
const activitySessionHelper = require("../../helper/activitySession.helper");
const userConsentModel = require("../../model/userconsent.model");
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_TIME_MS = 5 * 60 * 1000;
const RESET_TIME_MS = 55 * 60 * 1000;
class authController {
  register = async (request, response, nextFunction) => {
    try {
      let validationResult = authValidation.validateRegister(request.body);
      const validationError = responseConstants.validatIonError(response, validationResult.error);
      if (validationError) return;
      request.body.email = request.body.email.trim().toLowerCase();
      if (await userModel.findOne({ email: request.body.email, is_deleted: deleteConstants.NOT_DELETED })) {
        return responseConstants.Forbidden(response, messageConstants.USER.EMAIL_EXISTS, null, statusCodes.CONFLICT);
      }
      if (await userModel.findOne({ phoneNumber: request.body.phoneNumber, is_deleted: deleteConstants.NOT_DELETED })) {
        return responseConstants.Forbidden(response, messageConstants.USER.PHONE_EXISTS, null, statusCodes.CONFLICT);
      }
      if (!await userConsentModel.findOne({ _id: request.body.termsCondtions, status: statusConstants.active, is_deleted: deleteConstants.NOT_DELETED })) {
        return responseConstants.Forbidden(response, "Terms & Conditions consent not found or inactive", null, statusCodes.NOT_FOUND);
      }
      if (request.body.cookiesPolicy) {
        if (!await userConsentModel.findOne({ _id: request.body.cookiesPolicy, status: statusConstants.active, is_deleted: deleteConstants.NOT_DELETED })) {
          return responseConstants.Forbidden(response, "Cookie policy consent not found or inactive", null, statusCodes.NOT_FOUND);
        }
      }
      if (!await userConsentModel.findOne({ _id: request.body.privacyPolicy, status: statusConstants.active, is_deleted: deleteConstants.NOT_DELETED })) {
        return responseConstants.Forbidden(response, "Privacy Policy consent not found or inactive", null, statusCodes.NOT_FOUND);
      }
      const data = await authService.register(request);
      await createAuditLog({ req: request, userId: data._id, action: auditLogConstants.REGISTER, entity: CollectionName.users, entityId: data._id });
      setAuthCookie(response, data.token);
      return responseConstants.success(response, messageConstants.USER.REGISTER_SUCCESS(data.fullName), data, statusCodes.OK);
    } catch (error) {
      nextFunction(error)
    }
  };

  login = async (request, response, nextFunction) => {
    try {
      const { error } = await authValidation.validateLogin(request.body);
      const validationError = responseConstants.validatIonError(response, error);
      if (validationError) return;
      request.body.email = request.body.email.trim().toLowerCase();
      const userData = await userModel.findOne({ email: request.body.email, is_deleted: deleteConstants.NOT_DELETED })
      if (!userData) {
        return responseConstants.Forbidden(response, messageConstants.USER.INVALID_CREDENTIALS, null, statusCodes.NOT_FOUND);
      }
      if (userData.status === "suspended") {
        return responseConstants.Forbidden(response, messageConstants.USER.INVALID_CREDENTIALS, null, statusCodes.OK);
      }
      const nowTs = Date.now();
      const lockExpired = userData.lockUntil && new Date(userData.lockUntil).getTime() <= nowTs;
      const inactivityExpired = !userData.lockUntil && userData.failedLoginAttempts > 0 && userData.lastFailedLoginAt && (nowTs - new Date(userData.lastFailedLoginAt).getTime() > RESET_TIME_MS);
      if (lockExpired || inactivityExpired) {
        await userModel.findByIdAndUpdate(userData._id, { failedLoginAttempts: 0, lockUntil: null, lastFailedLoginAt: null, });
        userData.failedLoginAttempts = 0;
        userData.lockUntil = null;
        userData.lastFailedLoginAt = null;
      }
      if (userData.lockUntil && new Date(userData.lockUntil).getTime() > Date.now()) {
        const msRemaining = new Date(userData.lockUntil).getTime() - Date.now();
        const minutesRemaining = Math.ceil(msRemaining / 60000);
        return responseConstants.Forbidden(response, `Account locked due to multiple failed login attempts. Please try again in ${minutesRemaining} minute(s).`, { isLocked: true, remainingMinutes: minutesRemaining }, statusCodes.OK);
      }
      const passwordMatches = await helper.comparePassword(request?.body?.password, userData?.password);
      if (passwordMatches) {
        await helper.upgradePasswordHashIfNeeded(
          userModel,
          userData._id,
          request?.body?.password,
          userData?.password
        );
      }
      if (!passwordMatches) {
        const attempts = (userData.failedLoginAttempts || 0) + 1;
        const now = new Date();
        if (attempts >= MAX_FAILED_ATTEMPTS) {
          const lockUntil = new Date(now.getTime() + LOCK_TIME_MS);
          await userModel.findByIdAndUpdate(userData._id, { failedLoginAttempts: attempts, lockUntil, lastFailedLoginAt: now, });
          await createAuditLog({
            req: request, userId: userData._id, action: auditLogConstants.FIVE_PASSWORD_ATTEMPT_ONLY,
            entity: CollectionName.users, entityId: userData._id,
            metadata: { failedLoginAttempts: attempts, lockUntil, lastFailedLoginAt: now, }
          });
          return responseConstants.BadRequest(response, `Account locked due to ${MAX_FAILED_ATTEMPTS} failed login attempts. Please try again in ${LOCK_TIME_MS / 60000} minutes.`,
            { isLocked: true, lockUntil, remainingMinutes: Math.ceil(LOCK_TIME_MS / 60000) }, statusCodes.OK);
        }
        await userModel.findByIdAndUpdate(userData._id, { $inc: { failedLoginAttempts: 1 }, lastFailedLoginAt: now, });
        const remaining = MAX_FAILED_ATTEMPTS - attempts;
        await createAuditLog({
          req: request, userId: userData._id, action: auditLogConstants.PASSWORD_ATTEMPT_FAILED,
          entity: CollectionName.users, entityId: userData._id, metadata: { lastFailedLoginAt: now, failedLoginAttempts: "login attempt" }
        });
        return responseConstants.Forbidden(response, messageConstants.USER.INVALID_CREDENTIALS, null, statusCodes.OK);
      }
      if (!userData.isEmailVerified) {
        const verificationData = await verificationModel.findOne({ userId: userData?._id });
        if (verificationData) {
          return responseConstants.Forbidden(response, "You didn't verify your email. Please verify your email", null, statusCodes.BAD_REQUEST);
        }
      }
      if (userData.mfaEnabled) {
        const twofa = await TwofaModel.findOne({ userId: userData._id });
        if (twofa) {
          const pendingToken = await twofaService.issuePendingLogin(userData._id);
          if (twofa.activeMethod === "email") {
            await twofaService.sendLoginEmailOtp(userData._id, otpModel);
          }
          await createAuditLog({ req: request, userId: userData._id, action: auditLogConstants.TWOFA_VERIFICATION_STARTED, entity: CollectionName.users, entityId: userData._id });
          await activitySessionHelper.createActivitySession(request, userData._id, pendingToken);
          return responseConstants.success(response, messageConstants.USER.NEEDS_2FA, { requires2FA: true, activeMethod: twofa.activeMethod, pendingToken }, statusCodes.OK);
        }
      }
      const consentStatus = await authService.checkConsentUpdates(userData);
      if (consentStatus.needConsentUpdate) {
        const setupToken = await helper.generateTokken({ _id: userData._id, email: userData.email, userType: userData.userType, scope: '2fa_setup_only' }, '15m');
        await activitySessionHelper.createActivitySession(request, userData._id, setupToken);
        await createAuditLog({ req: request, userId: userData._id, action: auditLogConstants.CONSENT_UPDATE_REQUIRED, entity: CollectionName.users, entityId: userData._id });
        setAuthCookie(response, setupToken, { maxAge: 15 * 60 * 1000 });
        return responseConstants.success(response, messageConstants.USER.NEEDS_CONSENT_UPDATE,
          {
            needConsentUpdate: true, updatedDocuments: consentStatus.updatedDocuments, requires2FASetup: false, mustLogoutAfterConsent: true,
            user: { _id: userData._id, email: userData.email, fullName: userData.fullName, userType: userData.userType, mfaEnabled: userData.mfaEnabld }
          }, statusCodes.OK
        );
      }
      if (userData.failedLoginAttempts > 0 || userData.lockUntil) {
        await userModel.findByIdAndUpdate(userData._id, { failedLoginAttempts: 0, lockUntil: null, lastFailedLoginAt: null, });
      }
      const sessionData = await authService.login(request, userData);
      await createAuditLog({ req: request, userId: userData._id, action: auditLogConstants.LOGIN, entity: CollectionName.users, entityId: userData._id });
      setAuthCookie(response, sessionData.token);
      const { token, ...sessionWithoutToken } = sessionData;
      return responseConstants.success(response, messageConstants.USER.LOGIN_SUCCESS(userData.fullName), { ...sessionWithoutToken, needConsentUpdate: false }, statusCodes.OK);
    } catch (error) {
      nextFunction(error);
    }
  };

  accountDelete = async (request, response, nextFunction) => {
    try {
      const { error } = await authValidation.validateAccountDelete(request.body);
      const validationError = responseConstants.validatIonError(response, error);
      if (validationError) return;
      const userPassword = await userModel.findOne({ _id: request?.auth?._id })
      if (!await helper.comparePassword(request?.body?.password, userPassword?.password)) {
        return responseConstants.BadRequest(response, messageConstants.USER.INCORRECT_PASSWORD, null);
      }
      const data = await authService.delete(request);
      await createAuditLog({
        req: request, userId: data._id, action: auditLogConstants.ACOUNTDELETE, entity: CollectionName.users, entityId: data._id, metadata: {
          deletionType: 'self_service',
          initiatedBy: 'user',
          passwordVerified: true,
        }
      });
      return responseConstants.success(response, messageConstants.USER.ACCOUNT_DELETED_SUCCESS, null, statusCodes.OK);
    } catch (error) {
      nextFunction(error)
    }
  };

  updateProfile = async (request, response, nextFunction) => {
    try {
      const validationResult = authValidation.validateUpdate(request.body);
      const validationError = responseConstants.validatIonError(
        response,
        validationResult.error
      );
      if (validationError) return;
      request.body.email = request.body.email?.trim().toLowerCase();
      if (request.body.email) {
        const existingUserWithEmail = await userModel.findOne({
          email: request.body.email,
          is_deleted: deleteConstants.NOT_DELETED,
          _id: { $ne: request.auth?._id },
        });

        if (existingUserWithEmail) {
          return responseConstants.Forbidden(
            response,
            messageConstants.USER.EMAIL_EXISTS,
            null,
            statusCodes.FORBIDDEN
          );
        }
      }
      if (request.body.phoneNumber) {
        const existingUserWithPhone = await userModel.findOne({
          phoneNumber: request.body.phoneNumber,
          is_deleted: deleteConstants.NOT_DELETED,
          _id: { $ne: request.auth?._id },
        });
        if (existingUserWithPhone) {
          return responseConstants.Forbidden(
            response,
            messageConstants.USER.PHONE_EXISTS,
            null,
            statusCodes.FORBIDDEN
          );
        }
      }
      const user = await userModel
        .findById(request?.auth?._id)
        .lean();
      if (!user) {
        return responseConstants.BadRequest(
          response,
          messageConstants.USER.USER_NOT_FOUND,
          null
        );
      }
      const PROFILE_UPDATE_FIELDS = [
        'userType',
        'title',
        'profilePicture',
        'fullName',
        'email',
        'phoneNumber',
        'address1',
        'address2',
        'preferredCurrency',
        'city',
        'state',
        'zipCode',
        'companyName',
        'countryOfResidence',
        'dob',
        'gender',
        'countryCode',
        'accreditedCriteria',
      ];
      const changes = {};
      for (const field of PROFILE_UPDATE_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(request.body, field)) {
          changes[field] = {
            from: user[field] ?? null,
            to: request.body[field] ?? null,
          };
        }
      }
      const data = await authService.update(request);
      await createAuditLog({
        req: request,
        userId: request?.auth?._id,
        action: auditLogConstants.UPDATEPROFILE,
        entity: CollectionName.users,
        entityId: request?.auth?._id,
        metadata: {
          updateType: 'USER_SELF_UPDATE',
          changes,
        },
      });

      return responseConstants.success(
        response,
        messageConstants.USER.PROFILE_UPDATED,
        null,
        statusCodes.OK
      );
    } catch (error) {
      nextFunction(error);
    }
  };
  getProfile = async (request, response, nextFunction) => {
    try {
      const data = await authService.getProfile(request);
      return responseConstants.success(response, messageConstants.USER.PROFILE_FETCHED, data, statusCodes.OK);
    } catch (error) {
      nextFunction(error)
    }
  };
  acceptConsent = async (request, response, nextFunction) => {
    try {
      const validationResult =
        authValidation.validateAcceptConsent(request.body);
      const validationError = responseConstants.validatIonError(response, validationResult.error);
      if (validationError) return;
      await authService.acceptConsent(request);
      await createAuditLog({
        req: request,
        userId: request?.auth?._id,
        action: auditLogConstants.CONSENT_ACCEPTED,
        entity: CollectionName.userconsents,
        entityId: request?.auth?._id
      });
      if (request?.auth?.scope === '2fa_setup_only') {
        const userData = await userModel.findById(request.auth._id);
        if (userData) {
          const sessionData = await authService.login(request, userData);
          await createAuditLog({
            req: request,
            userId: userData._id,
            action: auditLogConstants.LOGIN,
            entity:CollectionName.userconsents,
            entityId: userData._id
          });
          setAuthCookie(response, sessionData.token);
          const { token, ...sessionWithoutToken } = sessionData;
          return responseConstants.success(
            response,
            "Consent updated successfully.",
            {
              consentAccepted: true,
              session: { ...sessionWithoutToken, needConsentUpdate: false }
            },
            statusCodes.OK
          );
        }
      }

      return responseConstants.success(response, "Consent updated successfully.", { consentAccepted: true }, statusCodes.OK);
    }
    catch (error) {
      nextFunction(error);
    }

  }
  getProfileConsents = async (request, response, nextFunction) => {
    try {
      const data =
        await authService.getProfileConsents(request);
      return responseConstants.success(response, "Consent details fetched successfully.", data, statusCodes.OK);
    } catch (error) {
      nextFunction(error);
    }

  }

  logout = async (request, response, nextFunction) => {
    try {
      const cookieToken = request.cookies?.[configenv.AUTH_COOKIE_NAME];
      let token = cookieToken;
      if (!token) {
        const bearerToken = request.headers["authorization"];
        token = bearerToken ? bearerToken.split(" ")[1] : undefined;
      }
      if (token) {
        const hashToken = await helper.hashToken(token);
        await sessionModel.deleteMany({ userId: request.auth._id, token: hashToken });
      }
      await clearAuthCookie(response);
      const testcookieToken = request.cookies?.[configenv.AUTH_COOKIE_NAME];
      await createAuditLog({ req: request, userId: request.auth._id, action: auditLogConstants.LOGOUT, entity:CollectionName.users, entityId: request.auth._id });
      return responseConstants.success(response, messageConstants.USER.LOGOUT_SUCCESS, null, statusCodes.OK);
    } catch (error) {
      nextFunction(error);
    }
  };
}

module.exports = new authController();
