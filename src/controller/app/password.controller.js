const helper = require("../../helper/helper");
const { setAuthCookie } = require("../../helper/authCookie");
const { createAuditLog } = require("../../helper/audit.helper");
const statusCodes = require("../../constants/httpConstants")
const CollectionName = require("../../constants/auditLogcollection.constant");
const responseConstants = require("../../constants/response.constatnts");
const { isPasswordSimilarToUserInfo } = require("../../utils/passwordSimilarity")
const userModel = require("../../model/user.model");
const crypto = require('crypto');
const { renderPage } = require('../../templates/verification.template');
const auditLogConstants = require("../../constants/auditLogConstants");
const passwordResetModel = require("../../model/passwordReset.model");
const passwordService = require("../../service/app/password.service");
const authService = require("../../service/app/auth.service");
const passwordValidation = require("../../validation/app/password.validation");
const userStatusConstants = require("../../constants/user.constants");
const userTypeConstants = require("../../constants/usertype.constants");
const messageConstants = require("../../constants/message.constants");
const optModel = require("../../model/otp.model");
const verificationModel = require('../../model/verification.model');
const deleteConstants = require("../../constants/delete.constants");
const verifyTemplate = require('../../templates/verified.template');
const moment = require("moment");
const otpModel = require("../../model/otp.model");
const sendEmail = require("../../helper/sendVerificationEmail");
const { OAuth2Client } = require("google-auth-library");
const appleSigninAuth = require("apple-signin-auth");
const sessionModel = require("../../model/session.model");
const configenv = require("../../config/env.config");
const TwofaModel = require("../../model/twofa.model");
const twofaService = require("../../service/app/twofa.service");
const client = new OAuth2Client(configenv.GOOGLE_CLIENT_ID);
const MAX_FAILED_ATTEMPTS = 3;
const LOCK_TIME_MS = 15 * 60 * 1000;
class passwordController {
    requestPasswordReset = async (request, response, nextFunction) => {
        try {
            request.body.email = request.body.email.trim().toLowerCase();
            const userData = await userModel.findOne({ email: request.body.email, is_deleted: deleteConstants.NOT_DELETED }, { password: 0 });
            if (userData) {
                await passwordService.requestPasswordReset(request, userData);
            }
            return responseConstants.success(response, messageConstants.USER.RESET_PASSWORD_GENERIC, null, statusCodes.OK);
        } catch (error) {
            nextFunction(error);
        }
    };
    checkPasswordResetToken = async (request, response, nextFunction) => {
        try {
            const { token } = request.query;
            if (!token) {
                return responseConstants.BadRequest(response, "Token is required on query params");
            }
            const resetDoc = await passwordResetModel.findOne({ tokenHash: token });
            if (!resetDoc) {
                return responseConstants.Forbidden(response, "This reset link is invalid or has expired. Please request a new one.");
            }
            return responseConstants.success(response, "Please reset the password.Before the token expiry", null, statusCodes.OK)

        } catch (error) {
            nextFunction(error)
        }
    }

    resetPassword = async (request, response, nextFunction) => {
        try {
            const { error } = await passwordValidation.validateResetPassword(request.body);
            const validationError = responseConstants.validatIonError(response, error);
            if (validationError) return;
            const { token, newPassword } = request.body;
            const tokenHash = helper.hashToken(token);
            const resetDoc =
                await passwordResetModel.findOne({ tokenHash });
            if (!resetDoc) {
                return responseConstants.BadRequest(response, messageConstants.USER.PASSWORD_RESET_LINK_INVALID, { canResend: true }, statusCodes.BAD_REQUEST);
            }
            const userData = await userModel.findById(resetDoc.userId);
            if (!userData) {
                return responseConstants.BadRequest(response, messageConstants.USER.USER_NOT_FOUND, null, statusCodes.BAD_REQUEST);
            }
            if (isPasswordSimilarToUserInfo(request?.body?.newPassword, {
                fullName: userData.fullName,
                email: userData.email,
                phoneNumber: userData.phoneNumber
            })) {
                return responseConstants.BadRequest(response, 'Password must not be similar to your name, email address, or phone number.', null, statusCodes.BAD_REQUEST);
            }
            if (resetDoc.used) {
                await createAuditLog({ req: request, userId: resetDoc.userId, action: auditLogConstants.PASSWORD_RESET_LINK_ALREADY_USED, entity: CollectionName.passwordresets, entityId: resetDoc._id });
                return responseConstants.BadRequest(
                    response, messageConstants.USER.PASSWORD_RESET_LINK_ALREADY_USED, { canResend: true },
                    statusCodes.BAD_REQUEST
                );
            }
            if (resetDoc.expiresAt < new Date()) {
                await createAuditLog({ req: request, userId: resetDoc.userId, action: auditLogConstants.PASSWORD_RESET_LINK_EXPIRED, entity: CollectionName.passwordresets, entityId: resetDoc._id });
                return responseConstants.BadRequest(response, messageConstants.USER.PASSWORD_RESET_LINK_EXPIRED, { canResend: true }, statusCodes.BAD_REQUEST);
            }

            await passwordService.resetPassword(
                resetDoc,
                userData,
                newPassword
            );

            await createAuditLog({
                req: request,
                userId: userData._id,
                action: auditLogConstants.PASSWORD_RESET_SUCCESS,
                entity: CollectionName.users,
                fromState: 'PASSWORD_SET',
                toState: 'PASSWORD_RESET',
                entityId: userData._id,
                metadata: {
                    resetType: 'FORGOT_PASSWORD',
                    changedFields: ['password'],
                    passwordChanged: true,
                },
            });
            return responseConstants.success(
                response,
                messageConstants.USER.PASSWORD_RESET_SUCCESS,
                null,
                statusCodes.OK
            );

        } catch (error) {
            nextFunction(error);
        }
    };
    validateResetToken = async (request, response, nextFunction) => {
        try {
            const { token } = request.query;
            if (!token) {
                return responseConstants.BadRequest(response, "token is required", null, statusCodes.BAD_REQUEST);
            }
            const result = await passwordService.validateResetToken(request, token);
            if (!result.valid) {
                return responseConstants.BadRequest(response, result.message, { valid: false, reason: result.reason }, statusCodes.BAD_REQUEST);
            }
            return responseConstants.success(response, "Reset link is valid.", { valid: true }, statusCodes.OK);
        } catch (error) {
            nextFunction(error);

        }
    };

    changePassword = async (request, response, nextFunction) => {
        try {
            const { error } = await passwordValidation.validateChangePassword(request.body);
            const validationError = responseConstants.validatIonError(response, error);
            if (validationError) return;
            if (!request?.body?.oldPassword) {
                return responseConstants.BadRequest(response, messageConstants.USER.OLD_PASSWORD_REQUIRED || 'Old password is required');
            }
            const user = await userModel.findById(request?.auth?._id);
            if (!user) return responseConstants.BadRequest(response, messageConstants.USER.USER_NOT_FOUND);
            const isOldPasswordCorrect = await helper.comparePassword(request?.body?.oldPassword, user.password);
            if (!isOldPasswordCorrect) return responseConstants.BadRequest(response, messageConstants.USER.OLD_PASSWORD_INCORRECT);
            if (request?.body?.oldPassword === request?.body?.newPassword) return responseConstants.BadRequest(response, messageConstants.USER.SAME_PASSWORD);
            if (isPasswordSimilarToUserInfo(request.body.newPassword, {
                fullName: user.fullName,
                email: user.email,
                phoneNumber: user.phoneNumber
            })) {
                return responseConstants.BadRequest(response, 'Password must not be similar to your name, email address, or phone number.');
            }
            await createAuditLog({
                req: request,
                userId: user._id,
                action: auditLogConstants.PASSWORD_CHANGED,
                entity: CollectionName.users,
                entityId: user._id,
                metadata: {
                    changeType: 'USER_INITIATED',
                    changedFields: ['password'],
                    passwordChanged: true,
                },
            }); await passwordService.changePassword(request);
            return responseConstants.success(response, messageConstants.USER.PASSWORD_UPDATED);
        } catch (error) {
            nextFunction(error)
        }
    };
    resendVerfication = async (request, response, nextFunction) => {
        try {
            const { error } = await passwordValidation.validateResendVerification(request.body);
            const validationError = responseConstants.validatIonError(response, error);
            if (validationError) return;
            const userData = await userModel.findOne({ _id: request?.body?.userId });
            if (!userData || userData.is_deleted === deleteConstants.DELETED) {
                return responseConstants.BadRequest(response, messageConstants.USER.USER_NOT_FOUND);
            }
            const rawToken = crypto.randomBytes(32).toString("hex");
            const tokenHash = helper.hashToken(rawToken);
            if (await verificationModel.findOne({ userId: userData?._id })) {
                await verificationModel.deleteOne({ userId: userData?._id });
            }
            const verifyData = await verificationModel.create({ userId: userData?._id, tokenHash, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
            const subject = "Verification email";
            const verifyUrl = `${configenv.BACKEND_URL}?token=${rawToken}`;
            const html = await verifyTemplate({ verifyUrl });
            sendEmail(userData?.email, subject, html);
            await createAuditLog({ req: request, userId: userData._id, action: auditLogConstants.VERIFICATION_EMAIL_SENT, entity: CollectionName.verifications, entityId: verifyData._id, });
            return responseConstants.success(response, "Verification email sent successfully!", null, statusCodes.OK);
        } catch (error) {
            nextFunction(error);
        }
    };


    emailVerification = async (request, response, nextFunction) => {
        try {
            const token = request?.query?.token;
            if (!token || typeof token !== "string") {
                return response.send(renderPage({ nonce: response.locals.cspNonce, icon: "❌", iconColor: "#dc2626", title: "Invalid Link", message: "This verification link is invalid.", showResend: false, showContinue: false, }));
            }
            const tokenHash = helper.hashToken(token);
            const verifyOtp = await verificationModel.findOne({ tokenHash });
            let twoFaPath = '/buyer/two-factor-auth';
            let verifiedUser = null;
            if (verifyOtp?.userId) {
                try {
                    verifiedUser = await userModel.findById(verifyOtp.userId);
                    if (verifiedUser?.userType === userTypeConstants.Seller) twoFaPath = '/seller/two-factor-auth';
                } catch { /* keep the buyer default on lookup failure */ }
            }
            const buildAuthedContinueUrl = async () => {
                if (!verifiedUser) return `${configenv.FRONTEND_URL}${twoFaPath}`;
                const sessionData = await authService.login(request, verifiedUser);
                setAuthCookie(response, sessionData.token);
                const params = new URLSearchParams({ _id: String(sessionData._id || ''), userType: sessionData.userType || '', fullName: sessionData.fullName || '', email: sessionData.email || '', mfaEnabled: String(sessionData.mfaEnabled), next: twoFaPath, });
                return `${configenv.FRONTEND_URL}/verify-email/continue?${params.toString()}`;
            };
            if (!verifyOtp) {
                return response.send(renderPage({ nonce: response.locals.cspNonce, icon: "❌", iconColor: "#dc2626", title: "Invalid Link", message: "This verification link is invalid.", showResend: false, showContinue: false, }));
            }
            const now = new Date();
            const expiresAt = verifyOtp.expiresAt ? new Date(verifyOtp.expiresAt) : null;
            const isExpired = !expiresAt || Number.isNaN(expiresAt.getTime()) || now > expiresAt;
            if (isExpired) {
                return response.send(renderPage({ nonce: response.locals.cspNonce, icon: "❌", iconColor: "#dc2626", title: "Link Expired", message: "Your verification link has expired. Please request a new one below.", showResend: true, showContinue: false, userId: verifyOtp.userId, }));
            }
            if (verifyOtp.used) {
                return response.send(renderPage({ nonce: response.locals.cspNonce, icon: "✅", iconColor: "#059669", title: "Email Already Verified", message: "Your email address has already been verified. Please log in to continue.", showResend: false, showContinue: true, redirectUrl: `${configenv.FRONTEND_URL}`, }));
            }
            const claimed = await verificationModel.findOneAndUpdate({ tokenHash, used: false, expiresAt: { $gt: now } }, { $set: { used: true, usedAt: now } }, { new: true });
            if (!claimed) {
                return response.send(renderPage({ nonce: response.locals.cspNonce, icon: "✅", iconColor: "#059669", title: "Email Already Verified", message: "Your email address has already been verified. Please log in to continue.", showResend: false, showContinue: true, redirectUrl: `${configenv.FRONTEND_URL}`, }));
            }
            await passwordService.verificationEmail(tokenHash, claimed.userId);
            return response.send(renderPage({ nonce: response.locals.cspNonce, icon: "✅", iconColor: "#059669", title: "Email Verified Successfully", message: "Your email address has been verified. You're being signed in — continue to set up two-factor authentication.", showResend: false, showContinue: true, redirectUrl: await buildAuthedContinueUrl(), }));
        } catch (error) {
            nextFunction(error);
        }
    };

}

module.exports = new passwordController();