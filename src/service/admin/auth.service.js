const { applyProfileImageChange } = require('../../helper/profileImage.helper');
const helper = require('../../helper/helper')
const adminModel = require('../../model/admin.model');
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const deleteConstants = require("../../constants/delete.constants")
const sendEmail = require("../../helper/sendVerificationEmail");
const otpModel = require('../../model/otp.model');
const { REALMS, resolveAccess, describeAccess, isSuperAdmin } = require('../../helper/authorization.helper');
const statusCodes = require("../../constants/httpConstants");
const BRAND = require('../../config/brand.config');
const configenv = require('../../config/env.config');
const { passwordResetEmail } = require('../../templates/accountEmails');
const accountToken = require('../../helper/accountToken.helper');
const { TOKEN_TYPES, ACCOUNTS, STATES } = accountToken;
const passwordService = require('../app/password.service');
const sessionModel = require('../../model/session.model');
const statusConstants = require('../../constants/status.constants');
const auditLogConstants = require('../../constants/auditLogConstants');
const CollectionName = require('../../constants/auditLogcollection.constant');
const { createAuditLogAdmin } = require('../../helper/audit.helper');
const { isPasswordSimilarToUserInfo } = require('../../utils/passwordSimilarity');
const logger = require('../../logger/error.logger');
const authService = {}

// Login/profile responses carry the admin's effective access so the UI can
// show only what they may use. Display only — every API re-checks it.
async function withAccess(user) {
    const access = await resolveAccess(user, REALMS.ADMIN);
    return { ...user, isSuperAdmin: isSuperAdmin(user), ...describeAccess(access) };
}

authService.login = async (data) => {
    if (data?.isPasswordSet === false) {
        throw Object.assign(new Error("Password not set"), { statusCode: statusCodes.BAD_REQUEST });
    }
    const user = data.toObject();
    delete user.password;
    const withRole = await withAccess(user);
    // Staff without an active role could not use anything — refuse the
    // sign-in instead of opening an empty console (fail closed).
    if (!withRole.isSuperAdmin && !withRole.role) {
        throw Object.assign(new Error("Your account has no active role. Contact the administrator."), { statusCode: statusCodes.FORBIDDEN });
    }
    const loginTime = new Date();
    const [token] = await Promise.all([helper.generateTokken({ ...user, inactivityDate: loginTime }), adminModel.updateOne({ _id: data._id }, { $set: { inactivityDate: loginTime } })]);
    return { ...withRole, inactivityDate: loginTime, token };
};

authService.changePassword = async (request) => {
    const adminId = request?.auth?._id;
    const hashPassword = await helper.createPassword(request.body.newPassword);
    await adminModel.findByIdAndUpdate({ _id: adminId }, { password: hashPassword });
    // Sign out every other device, and kill any reset link emailed earlier.
    const currentSessionId = request.session?._id;
    await sessionModel.deleteMany({ adminId, ...(currentSessionId ? { _id: { $ne: currentSessionId } } : {}) });
    await accountToken.revokeActive({ account: ACCOUNTS.ADMIN, ownerId: adminId, types: [TOKEN_TYPES.PASSWORD_RESET] });
    passwordService.sendPasswordChangedNotice({ fullName: request.auth.fullName, email: request.auth.email });
};

// ---- Forgot password (Super Admin + staff) ---------------------------------
// Same rules as the user flow: generic answer, one link per minute, a new
// link revokes the old one, 1-hour single-use tokens. Only accounts that have
// already set a password can reset it — someone still invited uses the
// invitation link (and an invitation link never works here, nor vice versa).
const RESET_COOLDOWN_MS = 60 * 1000;
const RESET = { type: TOKEN_TYPES.PASSWORD_RESET, account: ACCOUNTS.ADMIN };
const resettable = { is_deleted: deleteConstants.NOT_DELETED, status: statusConstants.active, isPasswordSet: true };

authService.requestPasswordReset = async (request, email) => {
    const admin = await adminModel.findOne({ email, ...resettable }).select("_id email fullName").lean();
    if (!admin) return { code: "NO_ACCOUNT" };
    const previous = await accountToken.latest({ ...RESET, ownerId: admin._id });
    if (previous && Date.now() - new Date(previous.createdAt).getTime() < RESET_COOLDOWN_MS) {
        await createAuditLogAdmin({ req: request, adminId: admin._id, action: auditLogConstants.PASSWORD_RESET_ALREADY_REQUESTED, entity: CollectionName.passwordresets, entityId: previous._id });
        return { code: "COOLDOWN" };
    }
    const { rawToken, record, validFor } = await accountToken.issue({ ...RESET, ownerId: admin._id });
    const resetUrl = `${configenv.FRONTEND_URL}/admin/reset-password?token=${rawToken}`;
    // Not awaited, so response time doesn't reveal whether the account exists.
    sendEmail(admin.email, `Reset your ${BRAND.NAME} admin password`, passwordResetEmail({ resetUrl, validFor }));
    await createAuditLogAdmin({ req: request, adminId: admin._id, action: auditLogConstants.PASSWORD_RESET_LINK_SENT, entity: CollectionName.passwordresets, entityId: record._id });
    return { code: "RESET_LINK_SENT" };
};

/** Check an admin reset link without using it. Never throws for a bad token. */
authService.validateResetToken = async (token) => {
    const { state, record, message } = await accountToken.inspect(token, RESET);
    if (state !== STATES.VALID) return { valid: false, reason: state, message, record };
    const admin = await adminModel.findOne({ _id: record.adminId, ...resettable }).select("_id fullName email").lean();
    if (!admin) return { valid: false, reason: STATES.INVALID, message: accountToken.MESSAGES[TOKEN_TYPES.PASSWORD_RESET].INVALID, record };
    return { valid: true, record, admin };
};

/** @returns {{ ok: true, adminId } | { ok: false, reason, message }} */
authService.resetPassword = async (request, { token, newPassword }) => {
    const check = await authService.validateResetToken(token);
    if (!check.valid) {
        if (check.record) await createAuditLogAdmin({ req: request, adminId: check.record.adminId, action: check.reason === STATES.EXPIRED ? auditLogConstants.PASSWORD_RESET_LINK_EXPIRED : check.reason === STATES.USED ? auditLogConstants.PASSWORD_RESET_LINK_ALREADY_USED : auditLogConstants.PASSWORD_RESET_LINK_INVALID, entity: CollectionName.passwordresets, entityId: check.record._id });
        return { ok: false, reason: check.reason, message: check.message };
    }
    const { admin } = check;
    if (isPasswordSimilarToUserInfo(newPassword, { fullName: admin.fullName, email: admin.email })) {
        return { ok: false, reason: "WEAK_PASSWORD", message: "Password must not be similar to your name or email address." };
    }
    if (!(await accountToken.consume(check.record))) {
        const again = await accountToken.inspect(token, RESET);
        return { ok: false, reason: again.state, message: again.message || accountToken.MESSAGES[TOKEN_TYPES.PASSWORD_RESET].INVALID };
    }
    await adminModel.updateOne({ _id: admin._id }, { password: await helper.createPassword(newPassword), failedLoginAttempts: 0, lockUntil: null, lastFailedLoginAt: null });
    await accountToken.revokeActive({ account: ACCOUNTS.ADMIN, ownerId: admin._id });
    await helper.AdmindeleteSession(admin._id);
    passwordService.sendPasswordChangedNotice(admin);
    await createAuditLogAdmin({ req: request, adminId: admin._id, action: auditLogConstants.PASSWORD_RESET_SUCCESS, entity: CollectionName.admins, entityId: admin._id, metadata: { resetType: "FORGOT_PASSWORD", passwordChanged: true } });
    return { ok: true, adminId: admin._id };
};


authService.updateProfile = async (request) => {
    const userId = request?.auth?._id;
    const current = await adminModel.findOne({ _id: userId, is_deleted: deleteConstants.NOT_DELETED }).select("profilePicture");
    const $set = { fullName: request.body.fullName };
    // Same shared photo lifecycle as buyers/sellers (validate, move out of
    // the date-sharded temp folder, delete the replaced file, '' removes).
    const storedPicture = await applyProfileImageChange({ current: current?.profilePicture, next: request.body.profilePicture, folder: "adminProfile" });
    if (storedPicture !== undefined) $set.profilePicture = storedPicture;
    const data = await adminModel.findOneAndUpdate(
        { _id: userId, is_deleted: deleteConstants.NOT_DELETED },
        { $set },
        { new: true }
    ).select("fullName profilePicture email type isSuperAdmin roleId mfaEnabled").lean();
    // Same shape as getProfile (incl. role/roleName), so saving a name or
    // photo doesn't drop the role from the account screen.
    return data ? withAccess(data) : data;
};

authService.getProfile = async (request) => {
    const data = await adminModel.findOne({ _id: request?.auth?._id, is_deleted: deleteConstants.NOT_DELETED }).select("fullName profilePicture email type isSuperAdmin roleId mfaEnabled").lean();
    if (!data) return data;
    return withAccess(data);
};
module.exports = authService