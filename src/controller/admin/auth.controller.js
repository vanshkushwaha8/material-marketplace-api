const responseConstants = require("../../constants/response.constatnts");
const statusCodes = require("../../constants/httpConstants");
const helper = require("../../helper/helper");
const { setAdminAuthCookie, clearAdminAuthCookie } = require("../../helper/authCookie");
const configenv = require("../../config/env.config");
const bcrypt = require('bcrypt');
const adminValidation = require("../../validation/admin/auth.validation");
const authService = require("../../service/admin/auth.service");
const twofaService = require("../../service/app/twofa.service");
const { createAuditLogAdmin } = require("../../helper/audit.helper");
const deleteConstants = require("../../constants/delete.constants");
const CollectionName = require("../../constants/auditLogcollection.constant");
const adminModel = require("../../model/admin.model");
const TwofaModel = require("../../model/twofa.model");
const otpModel = require("../../model/otp.model");
const statusConstants = require("../../constants/status.constants");
const messageConstants = require("../../constants/message.constants");
const moment = require("moment");
const sessionModel = require('../../model/session.model');
const auditLogConstants = require("../../constants/auditLogConstants");
const activitySessionHelper = require("../../helper/activitySession.helper");
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_TIME_MS = 5 * 60 * 1000;
const RESET_TIME_MS = 55 * 60 * 1000;
class adminController {
    login = async (request, response, nextFunction) => {
        try {
            const { error } = await adminValidation.validateLogin(request.body);
            const validationError = responseConstants.validatIonError(response, error);
            if (validationError) return;
            const userData = await adminModel.findOne({ email: request.body.email, is_deleted: deleteConstants.NOT_DELETED, status: statusConstants.active, });
            if (!userData) {
                return responseConstants.BadRequest(response, messageConstants.ADMIN.INVALID_CREDENTIALS);
            }
            const nowTs = Date.now();
            const lockExpired = userData.lockUntil && new Date(userData.lockUntil).getTime() <= nowTs;
            const inactivityExpired = !userData.lockUntil && userData.failedLoginAttempts > 0 && userData.lastFailedLoginAt && (nowTs - new Date(userData.lastFailedLoginAt).getTime() > RESET_TIME_MS);
            if (lockExpired || inactivityExpired) {
                await adminModel.findByIdAndUpdate(userData._id, { failedLoginAttempts: 0, lockUntil: null, lastFailedLoginAt: null, });
                userData.failedLoginAttempts = 0;
                userData.lockUntil = null;
                userData.lastFailedLoginAt = null;
            }
            if (userData.lockUntil && new Date(userData.lockUntil).getTime() > nowTs) {
                const msRemaining = new Date(userData.lockUntil).getTime() - nowTs;
                const minutesRemaining = Math.ceil(msRemaining / 60000);
                return responseConstants.Forbidden(response, `Account locked due to multiple failed login attempts. Please try again in ${minutesRemaining} minute(s).`, { isLocked: true, remainingMinutes: minutesRemaining }, statusCodes.OK);
            }
            const passwordMatches = await helper.comparePassword(request?.body?.password, userData?.password);
            if (!passwordMatches) {
                const attempts = (userData.failedLoginAttempts || 0) + 1;
                const now = new Date();
                if (attempts >= MAX_FAILED_ATTEMPTS) {
                    const lockUntil = new Date(now.getTime() + LOCK_TIME_MS);
                    await Promise.all([adminModel.findByIdAndUpdate(userData._id, { failedLoginAttempts: attempts, lockUntil, lastFailedLoginAt: now, }),
                    createAuditLogAdmin({ req: request, adminId: userData._id, action: auditLogConstants.FIVE_PASSWORD_ATTEMPT_ONLY, entity: CollectionName.admins, entityId: userData._id, metadata: { failedLoginAttempts: attempts, lockUntil, lastFailedLoginAt: now } }),
                    ]);
                    return responseConstants.BadRequest(response, `Account locked due to ${MAX_FAILED_ATTEMPTS} failed login attempts. Please try again in ${LOCK_TIME_MS / 60000} minutes.`, { isLocked: true, lockUntil, remainingMinutes: Math.ceil(LOCK_TIME_MS / 60000) }, statusCodes.OK);
                }
                await Promise.all([
                    adminModel.findByIdAndUpdate(userData._id, { $inc: { failedLoginAttempts: 1 }, lastFailedLoginAt: now, }),
                    createAuditLogAdmin({ req: request, adminId: userData._id, action: auditLogConstants.PASSWORD_ATTEMPT_FAILED, entity: CollectionName.admins, entityId: userData._id, metadata: { lastFailedLoginAt: now, failedLoginAttempts: "login attempt" } }),
                ]);
                return responseConstants.Forbidden(response, messageConstants.USER.INVALID_CREDENTIALS, null, statusCodes.OK);
            }
            const resetLockPromise = (userData.failedLoginAttempts > 0 || userData.lockUntil) ? adminModel.findByIdAndUpdate(userData._id, { failedLoginAttempts: 0, lockUntil: null, lastFailedLoginAt: null, }) : null;
            if (userData.mfaEnabled) {
                const twofa = await TwofaModel.findOne({ userId: userData._id });
                if (twofa) {
                    const pendingToken = await twofaService.issuePendingLogin(userData._id);
                    if (twofa.activeMethod === "email") {
                        await twofaService.sendLoginEmailOtp(userData._id, otpModel);
                    }
                    await Promise.all([
                        createAuditLogAdmin({ req: request, adminId: userData._id, action: auditLogConstants.TWOFA_VERIFICATION_STARTED, entity: CollectionName.admins, entityId: userData._id, metadata: {} }),
                        resetLockPromise,
                        activitySessionHelper.createActivitySession(request, userData._id, pendingToken),
                    ]);
                    return responseConstants.success(response, messageConstants.USER.NEEDS_2FA, { requires2FA: true, activeMethod: twofa.activeMethod, pendingToken }, statusCodes.OK);
                }
            }
            const data = await authService.login(userData);
            const rounds = bcrypt.getRounds(userData?.password);
            if (request?.body?.password && rounds < configenv.COST_FACTOR) {
                const password = await bcrypt.hash(request.body.password, configenv.COST_FACTOR);
                await adminModel.findByIdAndUpdate(userData._id, { password: password });
            }
            const ipAddress = request.headers["x-forwarded-for"]?.split(",")[0]?.trim() || request.socket.remoteAddress || request.ip;
            const [hashToken] = await Promise.all([helper.hashToken(data?.token), createAuditLogAdmin({ req: request, adminId: userData._id, action: auditLogConstants.ADMIN_LOGIN, entity: CollectionName.admins, entityId: userData._id, metadata: { login: "sucessfully login" } }),
                , resetLockPromise,]);
            await sessionModel.create({ adminId: userData?._id, token: hashToken, ipAddress: ipAddress });
            setAdminAuthCookie(response, data.token);
            const { token, ...dataWithoutToken } = data;
            return responseConstants.success(response, messageConstants.ADMIN.LOGIN_SUCCESS(data.fullName), dataWithoutToken, statusCodes.OK);
        } catch (error) {
            nextFunction(error);
        }
    };


    changePassword = async (request, response, nextFunction) => {
        try {
            const { error } = await adminValidation.validateChangePassword(request.body);
            const validationError = responseConstants.validatIonError(response, error);
            if (validationError) return;

            const userPassword = await adminModel.findOne({ _id: request?.auth?._id })
            if (!await helper.comparePassword(request?.body?.oldPassword, userPassword?.password)) {
                return responseConstants.BadRequest(response, "Please Enter correct old password");
            }
            if (request?.body?.oldPassword === request?.body?.newPassword) {
                return responseConstants.BadRequest(response, "Look like you enter same password",);
            }
            await authService.changePassword(request);
            await createAuditLogAdmin({
                req: request,
                adminId: request.auth._id,
                action: auditLogConstants.ADMIN_CHANGE_PASSWORD,
                entity: CollectionName.admins,
                entityId: request.auth._id,
                metadata: {
                    changeType: "SELF_PASSWORD_CHANGE"
                }
            });
            return responseConstants.success(response, "Password Update successfully", null, statusCodes.OK);
        } catch (error) {
            nextFunction(error)
        }
    };

    getProfile = async (request, response, nextFunction) => {
        try {
            const data = await authService.getProfile(request);
            return responseConstants.success(response, "Admin profile fetched successfully", data, statusCodes.OK);
        } catch (error) {
            nextFunction(error)
        }
    };
    updateProfile = async (request, response, nextFunction) => {
        try {
            const { error } = adminValidation.validateUpdateProfile(request.body);
            const validationError = responseConstants.validatIonError(response, error);
            if (validationError) return;

            const data = await authService.updateProfile(request);
            await createAuditLogAdmin({
                req: request,
                adminId: request.auth._id,
                action: auditLogConstants.UPDATEPROFILE,
                entity: CollectionName.admins,
                entityId: request.auth._id,
            });
            return responseConstants.success(response, "Profile updated successfully", data, statusCodes.OK);
        } catch (error) {
            nextFunction(error)
        }
    };
    logout = async (request, response, nextFunction) => {
        try {
            const cookieToken = request.cookies?.[configenv.ADMIN_AUTH_COOKIE_NAME];
            let token = cookieToken;
            if (!token) {
                const bearerToken = request.headers["authorization"];
                token = bearerToken ? bearerToken.split(" ")[1] : undefined;
            }
            if (token) {
                const hashToken = await helper.hashToken(token);
                await sessionModel.deleteMany({ adminId: request.auth._id, token: hashToken });
            }
            clearAdminAuthCookie(response);
            await createAuditLogAdmin({
                req: request, adminId: request?.auth?._id, action: auditLogConstants.ADMIN_LOGOUT,
                entity: CollectionName.admins, entityId: request?.auth?._id, 
            });
            return responseConstants.success(response, "Logged out successfully", null, statusCodes.OK);
        } catch (error) {
            nextFunction(error)
        }
    };
}
module.exports = new adminController()