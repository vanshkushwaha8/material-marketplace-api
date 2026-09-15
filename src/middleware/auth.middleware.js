const jwt = require("jsonwebtoken");
const responseConstants = require("../constants/response.constatnts");
const statusCodes = require("../constants/httpConstants");
const userModel = require("../model/user.model");
const mongoose = require("mongoose");
const logger = require("../logger/error.logger");
const sessionModel = require("../model/session.model");
const configenv = require("../config/env.config");
const helper = require('../helper/helper');
const sendEmail = require("../helper/sendVerificationEmail");
const { newLoginLocationTemplate } = require("../templates/newlocation.template");
const { clearAuthCookie } = require('../helper/authCookie');
const auditLogConstants = require("../constants/auditLogConstants");
const CollectionName = require("../constants/auditLogcollection.constant");
const { createAuditLog } = require("../helper/audit.helper");
const deleteConstants = require("../constants/delete.constants");
const statusConstants = require("../constants/status.constants");
const userConsentModel = require("../model/userconsent.model");
const userTypeConstants = require("../constants/usertype.constants");
const secretKey = configenv.SECRET_KEY;
const INACTIVITY_MS = 30 * 60 * 1000;
const getClientIp = (request) =>
    request.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    request.socket?.remoteAddress ||
    request.ip;
const authMiddleware = (allowedRoles = []) => {
    return async (request, response, nextFunction) => {
        try {
            const cookieToken = request.cookies?.[configenv.AUTH_COOKIE_NAME];
            let token = cookieToken;
            if (!token) {
                const authHeader = request.headers["authorization"];
                if (!authHeader) {
                    clearAuthCookie(response);
                    return responseConstants.unauthorized(response, "Authorization token is missing", statusCodes.UNAUTHORIZED);
                }
                const parts = authHeader.split(" ");
                if (parts.length !== 2 || parts[0] !== "Bearer") {
                    clearAuthCookie(response);
                    return responseConstants.unauthorized(response, "Invalid token format. Use Bearer token", statusCodes.UNAUTHORIZED);
                }
                token = parts[1];
            }
            const hashToken = await helper.hashToken(token)
            let decoded;
            try {
                decoded = jwt.verify(token, secretKey);
            } catch {
                clearAuthCookie(response);
                return responseConstants.unauthorized(response, "Invalid or expired token", statusCodes.UNAUTHORIZED);
            }
            const userId = decoded?._id;
            if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
                clearAuthCookie(response);
                return responseConstants.unauthorized(response, "Invalid token payload", statusCodes.UNAUTHORIZED);
            }
            const user = await userModel.findOne({ _id: userId, is_deleted: "0" });
            if (!user) {
                await sessionModel.deleteOne({ userId, token: hashToken }).catch(() => { });
                clearAuthCookie(response);
                return responseConstants.unauthorized(response, "User does not exist", statusCodes.UNAUTHORIZED);
            }
            if (user.status === "suspended") {
                await createAuditLog({
                    req: request, userId: userId,
                    action: auditLogConstants.USERSUSPEND,
                    entity: CollectionName.users,
                    entityId: userId, metadata: {}
                });
                await sessionModel.deleteMany({ userId: user._id }).catch(() => { });
                clearAuthCookie(response);
                return responseConstants.unauthorized(response, `${user.fullName} your account is suspended`, statusCodes.UNAUTHORIZED);
            }
            if (!user.isEmailVerified) {
                await createAuditLog({
                    req: request, userId: userId,
                    action: auditLogConstants.EMAIL_NOT_VERIFIED,
                    entity: CollectionName.users,
                    entityId: userId, metadata: {}
                });
                return responseConstants.unauthorized(response, "Email is not verified. Please verify your email first", statusCodes.UNAUTHORIZED);
            }

            if (allowedRoles.length && !allowedRoles.includes(user.userType)) {
                await createAuditLog({
                    req: request, userId: userId,
                    action: auditLogConstants.ROLE_ACCESS_DENIED,
                    entity: CollectionName.users,
                    entityId: userId, metadata: {}
                });
                return responseConstants.unauthorized(response, `Access denied. Allowed roles: ${allowedRoles.join(", ")}`, statusCodes.FORBIDDEN);
            }
            const isSetupToken = decoded?.scope === '2fa_setup_only';
            if (isSetupToken) {
                const allowedPaths = [
                    '/2fa/totp/provision',
                    '/2fa/totp/verify-setup',
                    '/2fa/email/initiate',
                    '/2fa/email/verify-setup',
                    '/2fa/acknowledge-recovery',
                    '/2fa/status',
                    '/2fa/switch-method',
                    '/accept-consent',
                    '/logout'
                ];
                if (!allowedPaths.includes(request.path)) {
                    await createAuditLog({
                        req: request, userId: userId,
                        action: auditLogConstants.TWOFA_ACCESS_DENIED,
                        entity: CollectionName.users,
                        entityId: userId, metadata: {}
                    });
                    return responseConstants.unauthorized(
                        response,
                        "Complete 2FA setup before accessing this resource",
                        statusCodes.UNAUTHORIZED
                    );
                }

                request.auth = { ...user.toObject(), scope: '2fa_setup_only' };
                return nextFunction();
            }
            const thirtyMinutesAgo = new Date(Date.now() - INACTIVITY_MS);
            if (user.inactivityDate && new Date(user.inactivityDate) < thirtyMinutesAgo) {
                await createAuditLog({
                    req: request, userId: userId,
                    action: auditLogConstants.SESSION_TIME_OUT,
                    entity: CollectionName.users,
                    entityId: userId, metadata: {}
                });
                await sessionModel.deleteOne({ userId: user._id, token: hashToken }).catch(() => { });
                clearAuthCookie(response);
                return responseConstants.unauthorized(response, "Session timed out due to inactivity. Please login again", statusCodes.UNAUTHORIZED);
            }
            const ipAddress = getClientIp(request);
            const sessionData = await sessionModel.findOne({
                userId: user._id,
                token: hashToken,
                expireOn: { $gt: new Date() }
            });
            if (!sessionData) {
                clearAuthCookie(response);
                return responseConstants.unauthorized(response, "Your session is expired. Please login again", statusCodes.UNAUTHORIZED);
            }
            if (sessionData.ipAddress && ipAddress && sessionData.ipAddress !== ipAddress) {
                await sessionModel.findByIdAndUpdate(sessionData._id, { ipAddress });
                logger.warn("Session used from a new IP", {
                    userId: String(user._id),
                    previousIp: sessionData.ipAddress,
                    newIp: ipAddress,
                    sessionId: String(sessionData._id),
                });
                (async () => {
                    try {
                        const html = await newLoginLocationTemplate({
                            name: user.fullName,
                            ipAddress,
                            time: new Date().toLocaleString(),
                        });
                        await createAuditLog({
                            req: request, userId: userId,
                            action: auditLogConstants.NEW_LOGIN_DETECTED,
                            entity: CollectionName.users,
                            entityId: userId, metadata: {}
                        });
                        await sendEmail(user.email, "New login location detected", html);
                    } catch (mailErr) {
                        logger.error("Failed to send new-IP notification", { message: mailErr.message });
                    }
                })();
            } else if (!sessionData.ipAddress && ipAddress) {
                await sessionModel.findByIdAndUpdate(sessionData._id, { ipAddress });
            }
            await userModel.findByIdAndUpdate(user._id, {
                inactivityDate: new Date(),
                is_online: true,
                lastSeen: new Date(),
            });
            request.auth = user;
            return nextFunction();
        } catch (error) {
            nextFunction(error);
        }
    };
};

const softAuthMiddleware = async (request, response, nextFunction) => {
    try {
        const cookieToken = request.cookies?.[configenv.AUTH_COOKIE_NAME];
        let token = cookieToken;
        if (!token) {
            const authHeader = request.headers["authorization"];
            if (!authHeader) {
                request.auth = null;
                return nextFunction();
            }
            const parts = authHeader.split(" ");
            if (parts.length !== 2 || parts[0] !== "Bearer") {
                request.auth = null;
                return nextFunction();
            }
            token = parts[1];
        }
        let decoded;
        try {
            decoded = jwt.verify(token, secretKey);
        } catch {
            request.auth = null;
            return nextFunction();
        }
        const userId = decoded?._id;
        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            request.auth = null;
            return nextFunction();
        }
        const user = await userModel.findById(userId);
        request.auth = (user && user.is_deleted !== "1") ? user : null;
        return nextFunction();
    } catch (error) {
        request.auth = null;
        return nextFunction();
    }
};
const consentEnforced = async (request, response, nextFunction) => {
    try {
        const user = request.auth;

        const latestConsentsRaw = await userConsentModel.find({
            status: statusConstants.active,
            is_deleted: deleteConstants.NOT_DELETED,
            userType: { $in: [user.userType, 'all'] },
        });

        const latestConsents = helper.mostSpecificConsentPerType(latestConsentsRaw);

        for (const consent of latestConsents) {
            if (consent.type === 'TERMS') {
                if (!user.termsCondtions || user.termsCondtions.toString() !== consent._id.toString()) {
                    await createAuditLog({
                        req: request, userId: request.auth?._id,
                        action: auditLogConstants.TERMS_CONSENTS_OUTDATED,
                        entity: CollectionName.users,
                        entityId: request.auth?._id, metadata: {}
                    });
                    return responseConstants.unauthorized(
                        response,
                        'Your Terms & Conditions acceptance is outdated. Please re-accept before continuing.',
                        statusCodes.UNAUTHORIZED
                    );
                }
            }
            if (consent.type === 'PRIVACY') {
                if (!user.privacyPolicy || user.privacyPolicy.toString() !== consent._id.toString()) {
                    await createAuditLog({
                        req: request, userId: request.auth?._id,
                        action: auditLogConstants.PRIVACEY_CONSENTS_OUTDATED,
                        entity: CollectionName.users,
                        entityId: request.auth?._id, metadata: {}
                    });
                    return responseConstants.unauthorized(
                        response,
                        'Your Privacy Policy acceptance is outdated. Please re-accept before continuing.',
                        statusCodes.UNAUTHORIZED
                    );
                }
            }
        }

        nextFunction();
    } catch (error) {
        logger.error(`Consent Middleware Error: ${error.message}`, { message: error.message, stack: error.stack });
        return responseConstants.error(response, 'Internal server error', statusCodes.INTERNAL_SERVER_ERROR);
    }
};


const twoFactorAuthenticationCheck = async (request, response, nextFunction) => {
    try {
        const user = request?.auth;
        if (!user?.mfaEnabled) {
            await createAuditLog({
                req: request, userId: request?.auth?._id,
                action: auditLogConstants.TWOFA_NOT_SETUP,
                entity: CollectionName.users,
                entityId: request?.auth?._id, metadata: {}
            });
            return responseConstants.unauthorized(response, "Please complete Two-Factor Authentication to continue.", statusCodes.UNAUTHORIZED);
        }
        return nextFunction();
    } catch (error) {
        nextFunction(error);
    }
};

const investorOnly = async (request, response, nextFunction) => {
    if (request?.auth?.userType !== userTypeConstants.Buyer) {
        await createAuditLog({
            req: request, userId: request?.auth?._id,
            action: auditLogConstants.ROLE_ACCESS_DENIED,
            entity: CollectionName.users,
            entityId: request?.auth?._id, metadata: {}
        });
        return responseConstants.unauthorized(response, "This resource is only available to investor accounts.", statusCodes.FORBIDDEN);
    }
    nextFunction();
};
const investorOrDeveloperOnly = async (request, response, nextFunction) => {
    const allowed = [userTypeConstants.Buyer, userTypeConstants.Seller];
    if (!allowed.includes(request?.auth?.userType)) {
        await createAuditLog({
            req: request, userId: request?.auth?._id,
            action: auditLogConstants.ROLE_ACCESS_DENIED,
            entity: CollectionName.users,
            entityId: request?.auth?._id, metadata: {}
        });
        return responseConstants.unauthorized(response, "This resource is only available to investor or developer accounts.", statusCodes.FORBIDDEN);
    }
    nextFunction();
};

module.exports = { authMiddleware, twoFactorAuthenticationCheck, consentEnforced, investorOnly, investorOrDeveloperOnly, softAuthMiddleware };