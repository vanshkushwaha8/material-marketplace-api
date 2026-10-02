const BRAND = require('../../config/brand.config');
const { passwordResetEmail, passwordChangedEmail } = require('../../templates/accountEmails');
const userModel = require('../../model/user.model');
const helper = require('../../helper/helper');
const sendEmail = require("../../helper/sendVerificationEmail");
const configenv = require('../../config/env.config');
const accountToken = require('../../helper/accountToken.helper');
const { TOKEN_TYPES, ACCOUNTS, STATES } = accountToken;
const deleteConstants = require('../../constants/delete.constants');
const { isPasswordSimilarToUserInfo } = require('../../utils/passwordSimilarity');
const verificationModel = require('../../model/verification.model');
const sessionModel = require('../../model/session.model');
const { createAuditLog } = require("../../helper/audit.helper");
const CollectionName = require("../../constants/auditLogcollection.constant");
const auditLogConstants = require("../../constants/auditLogConstants")
const passwordService = {};


passwordService.changePassword = async (request) => {
    const hashPassword = await helper.createPassword(request.body.newPassword);
    await userModel.findByIdAndUpdate({ _id: request?.auth?._id }, { password: hashPassword });
    // Keep only this device signed in. (The session token travels in the
    // httpOnly cookie, so the auth middleware's session record is the
    // reliable handle — the old Authorization-header lookup was empty for
    // cookie sessions and signed the user out everywhere, here included.)
    const currentSessionId = request.session?._id;
    await sessionModel.deleteMany({ userId: request.auth._id, ...(currentSessionId ? { _id: { $ne: currentSessionId } } : {}) });
    // A reset link emailed earlier must not undo this change.
    await accountToken.revokeActive({ account: ACCOUNTS.USER, ownerId: request.auth._id, types: [TOKEN_TYPES.PASSWORD_RESET] });
};

// One reset email per account per minute, whatever the request rate.
const RESEND_COOLDOWN_MS = 60 * 1000;

/**
 * Send a reset link to an existing account. The caller always answers with
 * the same generic message, so nothing here may reveal whether the email is
 * registered. A new request replaces (revokes) the previous link.
 */
passwordService.requestPasswordReset = async (request, userData) => {
    const owner = { type: TOKEN_TYPES.PASSWORD_RESET, account: ACCOUNTS.USER, ownerId: userData._id };
    const previous = await accountToken.latest(owner);
    if (previous && Date.now() - new Date(previous.createdAt).getTime() < RESEND_COOLDOWN_MS) {
        await createAuditLog({ req: request, userId: userData._id, action: auditLogConstants.PASSWORD_RESET_ALREADY_REQUESTED, entity: CollectionName.passwordresets, entityId: previous._id });
        return { code: "COOLDOWN" };
    }
    const { rawToken, record, validFor } = await accountToken.issue(owner);
    const resetUrl = `${configenv.FRONTEND_URL}/reset-password?token=${rawToken}`;
    // Not awaited: the response time must not reveal whether the account
    // exists (sendEmail logs its own failures).
    sendEmail(userData.email, `Reset your ${BRAND.NAME} password`, passwordResetEmail({ resetUrl, validFor }));
    await createAuditLog({ req: request, userId: userData._id, action: auditLogConstants.PASSWORD_RESET_LINK_SENT, entity: CollectionName.passwordresets, entityId: record._id });
    return { code: "RESET_LINK_SENT" };
};

const AUDIT_FOR_STATE = {
    INVALID: auditLogConstants.PASSWORD_RESET_LINK_INVALID,
    EXPIRED: auditLogConstants.PASSWORD_RESET_LINK_EXPIRED,
    USED: auditLogConstants.PASSWORD_RESET_LINK_ALREADY_USED,
    REVOKED: auditLogConstants.PASSWORD_RESET_LINK_INVALID,
};

/** Check a reset link without using it. Never throws for a bad token. */
passwordService.validateResetToken = async (request, token) => {
    const { state, record, message } = await accountToken.inspect(token, { type: TOKEN_TYPES.PASSWORD_RESET, account: ACCOUNTS.USER });
    if (state !== STATES.VALID) {
        if (record) await createAuditLog({ req: request, userId: record.userId, action: AUDIT_FOR_STATE[state], entity: CollectionName.passwordresets, entityId: record._id });
        return { valid: false, reason: state, message };
    }
    const userData = await userModel.findOne({ _id: record.userId, is_deleted: deleteConstants.NOT_DELETED }).select("_id status").lean();
    if (!userData || userData.status === "suspended") {
        return { valid: false, reason: STATES.INVALID, message: accountToken.MESSAGES[TOKEN_TYPES.PASSWORD_RESET].INVALID };
    }
    return { valid: true, record };
};

/**
 * Use a reset link: validate it, check the new password against the
 * account, consume the token atomically, then store the bcrypt hash.
 * @returns {{ ok: true } | { ok: false, reason: string, message: string }}
 */
passwordService.resetPassword = async (request, { token, newPassword }) => {
    const check = await passwordService.validateResetToken(request, token);
    if (!check.valid) return { ok: false, reason: check.reason, message: check.message };
    const userData = await userModel.findById(check.record.userId).select("fullName email phoneNumber");
    if (isPasswordSimilarToUserInfo(newPassword, { fullName: userData.fullName, email: userData.email, phoneNumber: userData.phoneNumber })) {
        return { ok: false, reason: "WEAK_PASSWORD", message: "Password must not be similar to your name, email address, or phone number." };
    }
    if (!(await accountToken.consume(check.record))) {
        // Used/revoked/expired between the check and now (e.g. a double submit).
        const again = await accountToken.inspect(token, { type: TOKEN_TYPES.PASSWORD_RESET, account: ACCOUNTS.USER });
        return { ok: false, reason: again.state, message: again.message || accountToken.MESSAGES[TOKEN_TYPES.PASSWORD_RESET].INVALID };
    }
    const hashPassword = await helper.createPassword(newPassword);
    await userModel.findByIdAndUpdate(userData._id, { password: hashPassword, isPasswordKey: true, failedLoginAttempts: 0, lockUntil: null, lastFailedLoginAt: null });
    // Any other outstanding link dies with this one; every session is signed out.
    await accountToken.revokeActive({ account: ACCOUNTS.USER, ownerId: userData._id, types: [TOKEN_TYPES.PASSWORD_RESET] });
    await helper.deleteSession(userData._id);
    await passwordService.sendPasswordChangedNotice(userData);
    return { ok: true, userId: userData._id };
};

passwordService.sendPasswordChangedNotice = async (userData) => {
    const subject = `Your ${BRAND.NAME} password was changed`;
    const html = passwordChangedEmail({ name: userData.fullName });
    sendEmail(userData.email, subject, html);
};

passwordService.verificationEmail = async (token, userId) => {
    await userModel.findByIdAndUpdate({ _id: userId }, { isEmailVerified: true });
    await verificationModel.updateOne(
        { tokenHash: token },
        { $set: { used: true } }
    );
};

module.exports = passwordService;