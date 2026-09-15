const userModel = require('../../model/user.model');
const helper = require('../../helper/helper');
const crypto = require('crypto');
const sendEmail = require("../../helper/sendVerificationEmail");
const configenv = require('../../config/env.config');
const passwordResetModel = require('../../model/passwordReset.model');
const verificationModel = require('../../model/verification.model');
const sessionModel = require('../../model/session.model');
const { createAuditLog } = require("../../helper/audit.helper");
const CollectionName = require("../../constants/auditLogcollection.constant");
const auditLogConstants = require("../../constants/auditLogConstants")
const messageConstants = require('../../constants/message.constants');
const passwordService = {};


passwordService.changePassword = async (request) => {
    const hashPassword = await helper.createPassword(request.body.newPassword);
    await userModel.findByIdAndUpdate({ _id: request?.auth?._id }, { password: hashPassword });
    const currentToken = (request.headers?.authorization || '').replace(/^Bearer\s+/i, '');
    const hashToken = await helper.hashToken(currentToken)
    if (hashToken) {
        await sessionModel.deleteMany({ userId: request.auth._id, token: { $ne: hashToken } });
    } else {
        await sessionModel.deleteMany({ userId: request.auth._id });
    }
};

passwordService.requestPasswordReset = async (request, userData) => {
    const existingReset = await passwordResetModel.findOne({
        userId: userData._id, used: false,
        expiresAt: {
            $gt: new Date()
        }
    });
    if (existingReset) {
        const remainingHours = Math.ceil(
            (existingReset.expiresAt.getTime() - Date.now()) /
            (1000 * 60 * 60)
        );
        await createAuditLog({
            req: request,
            userId: userData._id,
            action: auditLogConstants.PASSWORD_RESET_ALREADY_REQUESTED,
            entity: CollectionName.passwordresets,
            entityId: existingReset._id
        });
        return {
            code: "RESET_LINK_ALREADY_SENT",
            remainingHours
        };
    }
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = helper.hashToken(rawToken);
    const expiresAt = new Date(
        Date.now() + (24 * 60 * 60 * 1000)
    );
    const reset = await passwordResetModel.create({
        userId: userData._id,
        tokenHash,
        expiresAt
    });
    const resetUrl =
        `${configenv.FRONTEND_URL}/reset-password?token=${rawToken}`;
    const subject = "Reset your password";
    const html = `
        <p>We received a request to reset your password.</p>

        <p>
            <a href="${resetUrl}">
                Reset Password
            </a>
        </p>

        <p>
            This password reset link is valid for <strong>24 hours</strong>
            and can only be used once.
        </p>

        <p>
            If you did not request this password reset,
            you can safely ignore this email.
        </p>
    `;
    await sendEmail(
        userData.email,
        subject,
        html
    );
    await createAuditLog({
        req: request,
        userId: userData._id,
        action: auditLogConstants.PASSWORD_RESET_LINK_SENT,
        entity: CollectionName.passwordresets,
        entityId: reset._id
    });
    return {
        code: "RESET_LINK_SENT"
    };
};

passwordService.resetPassword = async (resetDoc, userData, newPassword) => {
    const hashPassword = await helper.createPassword(newPassword);
    await userModel.findByIdAndUpdate(userData._id, { password: hashPassword, isPasswordKey: true, failedLoginAttempts: 0, lockUntil: null, lastFailedLoginAt: null });
    await passwordResetModel.updateMany({ userId: userData._id, used: false }, { $set: { used: true } });
    await helper.deleteSession(userData._id);
    await passwordService.sendPasswordChangedNotice(userData);
    return true;
};

passwordService.validateResetToken = async (request, token) => {
    if (!token || typeof token !== "string") {
        return { valid: false, reason: "INVALID", message: messageConstants.USER.PASSWORD_RESET_LINK_INVALID };
    }
    const tokenHash = helper.hashToken(token);
    const resetDoc = await passwordResetModel.findOne({ tokenHash });
    if (!resetDoc) {
        return { valid: false, reason: "INVALID", message: messageConstants.USER.PASSWORD_RESET_LINK_INVALID };
    }
    const userData = await userModel.findOne({ _id: resetDoc.userId });
    if (resetDoc.used) {
        await createAuditLog({ req: request, userId: resetDoc.userId, action: auditLogConstants.PASSWORD_RESET_LINK_ALREADY_USED, entity: CollectionName.passwordresets, entityId: resetDoc._id });
        return { valid: false, reason: "USED", message: messageConstants.USER.PASSWORD_RESET_LINK_ALREADY_USED };
    }
    if (resetDoc.expiresAt < new Date()) {
        await createAuditLog({ req: request, userId: resetDoc?.userId, action: auditLogConstants.PASSWORD_RESET_LINK_EXPIRED, entity: CollectionName.passwordresets, entityId: resetDoc?._id });
        return { valid: false, reason: "EXPIRED", message: messageConstants.USER.PASSWORD_RESET_LINK_EXPIRED };
    }
    return { valid: true };
};

passwordService.sendVerificationEmail = async (request) => {
    await passwordResetModel.deleteMany({ userId: userData._id });
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = helper.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await passwordResetModel.create({ userId: userData._id, tokenHash, expiresAt });
    const resetUrl = `${configenv.FRONTEND_URL}/reset-password?token=${rawToken}`;
    const subject = "Reset your password";
    const html = `
        <p>We received a request to reset your password.</p>
        <p><a href="${resetUrl}">Click here to set a new password</a>. This link is valid for 1 hour and can be used once.</p>
        <p>If you didn't request this, you can safely ignore this email.</p>`;
    sendEmail(userData.email, subject, html);
};

passwordService.sendPasswordChangedNotice = async (userData) => {
    const subject = "Your password was changed";
    const html = `
        <p>Hi ${userData.fullName || "there"},</p>
        <p>Your  password was just changed and all active sessions were signed out.</p>
        <p>If this wasn't you, please reset your password immediately and contact support.</p>`;
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