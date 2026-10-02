const BRAND = require('../../config/brand.config');
const helper = require('../../helper/helper')
const adminModel = require('../../model/admin.model');
const roleModel = require('../../model/role.model');
const { createAuditLogAdmin } = require("../../helper/audit.helper");
const sendEmail = require("../../helper/sendVerificationEmail");
const accountToken = require('../../helper/accountToken.helper');
const { TOKEN_TYPES, ACCOUNTS, STATES } = accountToken;
const { isPasswordSimilarToUserInfo } = require('../../utils/passwordSimilarity');
const passwordService = require("../app/password.service")
const statusCodes = require("../../constants/httpConstants");
const auditLogConstants = require("../../constants/auditLogConstants");

const CollectionName = require("../../constants/auditLogcollection.constant");
const statusConstants = require("../../constants/status.constants");
const sessionModel = require('../../model/session.model');
const configenv = require('../../config/env.config');
const sendInviteAdmin = require("../../templates/InviteAdmin")
const mongoose = require("mongoose");
const path = require("path")
const fs = require("fs")
const deleteConstants = require("../../constants/delete.constants");
const logger = require('../../logger/error.logger');
const { AppError } = require('../../utils/AppError');

// Staff management never touches the Super Admin account: it isn't a
// "sub-admin" and must not be editable, disabled or re-roled from here.
async function findStaff(id) {
    const admin = await adminModel.findOne({ _id: id, is_deleted: deleteConstants.NOT_DELETED });
    if (!admin || admin.isSuperAdmin === true || admin.type === 'admin') {
        throw new AppError("Staff member not found", statusCodes.NOT_FOUND);
    }
    return admin;
}

// Staff can only be given an existing, active role.
async function assertAssignableRole(roleId) {
    const role = await roleModel.findOne({ _id: roleId, is_deleted: deleteConstants.NOT_DELETED, status: statusConstants.active }).select('_id').lean();
    if (!role) throw new AppError("Select an active role", statusCodes.BAD_REQUEST);
}

const subAdminService = {}
subAdminService.add = async (data, request) => {
    if (await adminModel.findOne({ email: data.email, is_deleted: deleteConstants.NOT_DELETED })) {
        throw Object.assign(new Error("Email already exist"), { statusCode: statusCodes.CONFLICT });
    }
    await assertAssignableRole(data.roleId);
    if (data?.profilePicture) {
        await helper.moveFileFromFolder(data.profilePicture, 'admin')
    }
    const userData = await adminModel.create({
        fullName: data.fullName,
        email: data.email,
        roleId: data.roleId,
        profilePicture: data.profilePicture || undefined,
        type: 'subadmin',
        isSuperAdmin: false,
    });
    const invitation = await sendInvitation(userData);
    await createAuditLogAdmin({
        req: request,
        adminId: request?.auth._id,
        action: auditLogConstants.SUBADMINCREATED,
        entity: CollectionName.admins,
        entityId: userData._id, metadata: {
            SUBADMINS: "SUBADMIN_ADD",
            info: invitation.audit,
        }
    });
};
subAdminService.resend = async (request) => {
    const userData = await findStaff(request?.query?._id);
    if (userData.isPasswordSet || userData.invitation === "accepted") {
        throw new AppError("This staff member has already set their password. They can use Forgot Password on the admin login page to change it.", statusCodes.BAD_REQUEST);
    }
    // Resending replaces the old link: issue() revokes it.
    const invitation = await sendInvitation(userData);
    await createAuditLogAdmin({
        req: request,
        adminId: request?.auth._id,
        action: auditLogConstants.SUBADMININVITERESEND,
        entity: CollectionName.admins,
        entityId: userData._id, metadata: {
            SUBADMINS: "SUBADMIN_INVITE_RESEND",
            info: invitation.audit,
        }
    });
};
subAdminService.update = async (data, request) => {
    const admin = await findStaff(data?._id);
    await assertAssignableRole(data.roleId);
    let newProfilePicture = data.profilePicture;
    if (newProfilePicture && newProfilePicture !== admin.profilePicture) {
        await helper.moveFileFromFolder(newProfilePicture, 'admin');
    }
    const existingEmail = await adminModel.findOne({ email: data.email, _id: { $ne: data?._id }, is_deleted: deleteConstants.NOT_DELETED, });
    if (existingEmail) {
        throw Object.assign(new Error("Email already in use by another admin"), { statusCode: statusCodes.CONFLICT });
    }
    if (admin.profilePicture && newProfilePicture && newProfilePicture !== admin.profilePicture) {
        const oldPath = path.join('public', 'admin', admin.profilePicture);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    const roleChanged = data.roleId && String(data.roleId) !== String(admin.roleId);
    await adminModel.findByIdAndUpdate(admin._id, {
        fullName: data.fullName,
        email: data.email,
        roleId: data.roleId,
        ...(data.profilePicture !== undefined ? { profilePicture: data.profilePicture } : {}),
    });
    if (roleChanged) {
        const [oldRole, newRole] = await Promise.all([
            roleModel.findOne({ _id: admin.roleId }),
            roleModel.findOne({ _id: data.roleId }),
        ]);
        await createAuditLogAdmin({
            req: request,
            adminId: request?.auth?._id,
            action: auditLogConstants.SUBADMIN_UPDATED,
            entity: CollectionName.admins,
            entityId: admin._id,
            reason: `Role changed from ${oldRole?.roleName || 'unknown'} to ${newRole?.roleName || 'unknown'}`,
            metadata: {
                updateType: "SUBADMIN_UPDATE",
                changes: {
                    email: {
                        from: admin?.email,
                        to: data.email
                    },
                    roleId: {
                        from: admin?.roleId,
                        to: data.roleId
                    },
                    fullName: {
                        from: admin.fullName,
                        to: data.fullName
                    },

                }
            }
        });
    } else {
        await createAuditLogAdmin({
            req: request,
            adminId: request?.auth?._id,
            action: auditLogConstants.SUBADMIN_UPDATED,
            entity: CollectionName.admins,
            entityId: admin._id,
            metadata: {
                updateType: "SUBADMIN_UPDATE",
                changes: {
                    email: {
                        from: admin?.email,
                        to: data.email
                    },
                    roleId: {
                        from: admin?.roleId,
                        to: data.roleId
                    },
                    fullName: {
                        from: admin.fullName,
                        to: data.fullName
                    },

                }
            }
        });

    }
};
// ---- Invitation link (/sub-admins/set-password?token=…) -------------------
// Valid only for an invited staff member who hasn't set a password yet. Once
// they have, the link is dead for good (consumed, and every other invitation
// revoked); later changes go through Forgot Password.
const INVITE = { type: TOKEN_TYPES.STAFF_INVITATION, account: ACCOUNTS.ADMIN };
const INVITE_MESSAGES = accountToken.MESSAGES[TOKEN_TYPES.STAFF_INVITATION];

subAdminService.validateInvitation = async (token) => {
    const { state, record, message } = await accountToken.inspect(token, INVITE);
    if (!record) return { valid: false, reason: state, message };
    const admin = await adminModel.findOne({ _id: record.adminId }).select("_id fullName email isPasswordSet invitation status is_deleted isSuperAdmin type").lean();
    if (!admin || admin.is_deleted === deleteConstants.DELETED || admin.isSuperAdmin === true || admin.type === 'admin') {
        return { valid: false, reason: STATES.INVALID, message: INVITE_MESSAGES.INVALID, record };
    }
    // Already set (whatever state this particular link is in) → the
    // "use Forgot Password" answer, never a second password set.
    if (admin.isPasswordSet || admin.invitation === "accepted") {
        return { valid: false, reason: "ALREADY_SET", message: INVITE_MESSAGES.USED, record, admin };
    }
    if (state !== STATES.VALID) return { valid: false, reason: state, message, record, admin };
    if (admin.status !== statusConstants.active) {
        return { valid: false, reason: STATES.INVALID, message: "This account has been deactivated. Contact the Super Admin.", record, admin };
    }
    return { valid: true, record, admin };
};

subAdminService.passwordSet = async (request) => {
    const { token, newPassword } = request.body;
    const check = await subAdminService.validateInvitation(token);
    if (!check.valid) {
        if (check.record) {
            await createAuditLogAdmin({ req: request, adminId: check.record.adminId, action: check.reason === STATES.EXPIRED ? auditLogConstants.PASSWORD_LINK_EXPIRED : auditLogConstants.PASSWORD_RESET_LINK_ALREADY_USED, entity: CollectionName.admins, entityId: check.record.adminId, metadata: { reason: check.reason } });
        }
        throw new AppError(check.message, statusCodes.BAD_REQUEST, check.reason, { valid: false, reason: check.reason });
    }
    const { admin } = check;
    if (isPasswordSimilarToUserInfo(newPassword, { fullName: admin.fullName, email: admin.email })) {
        throw new AppError("Password must not be similar to your name or email address.", statusCodes.BAD_REQUEST, "WEAK_PASSWORD", { reason: "WEAK_PASSWORD" });
    }
    if (!(await accountToken.consume(check.record))) {
        throw new AppError(INVITE_MESSAGES.USED, statusCodes.BAD_REQUEST, "ALREADY_SET", { valid: false, reason: "ALREADY_SET" });
    }
    // Conditional on isPasswordSet:false so two different valid links can't
    // both set a password.
    const updated = await adminModel.updateOne(
        { _id: admin._id, isPasswordSet: { $ne: true } },
        { password: await helper.createPassword(newPassword), failedLoginAttempts: 0, lockUntil: null, lastFailedLoginAt: null, isPasswordSet: true, invitation: "accepted" }
    );
    if (!updated.modifiedCount) {
        throw new AppError(INVITE_MESSAGES.USED, statusCodes.BAD_REQUEST, "ALREADY_SET", { valid: false, reason: "ALREADY_SET" });
    }
    await accountToken.revokeActive({ account: ACCOUNTS.ADMIN, ownerId: admin._id });
    await helper.AdmindeleteSession(admin._id);
    passwordService.sendPasswordChangedNotice({ fullName: admin.fullName, email: admin.email });
    await createAuditLogAdmin({
        req: request,
        adminId: admin._id,
        action: auditLogConstants.PASSWORDSET,
        entity: CollectionName.admins,
        entityId: admin._id,
        metadata: {
            updateType: "PASSWORD_SET",
            method: "STAFF_INVITATION"
        }
    });
};

/**
 * Issue a fresh invitation link (revoking earlier ones) and email it. The
 * raw token goes into the email only — the audit entry gets safe fields.
 */
async function sendInvitation(admin) {
    const { rawToken, expiresAt, validFor } = await accountToken.issue({ ...INVITE, ownerId: admin._id });
    const roleInfo = await roleModel.findOne({ _id: admin.roleId, is_deleted: deleteConstants.NOT_DELETED, status: statusConstants.active }).select("roleName").lean();
    const inviteUrl = `${configenv.FRONTEND_URL}/sub-admins/set-password?token=${rawToken}`;
    const html = await sendInviteAdmin({ name: admin.fullName, email: admin.email, roleName: roleInfo?.roleName, inviteUrl, validFor });
    sendEmail(admin.email, `You're invited to the ${BRAND.NAME} admin console`, html);
    return { audit: { name: admin.fullName, email: admin.email, roleName: roleInfo?.roleName, expiresAt } };
}

subAdminService.get = async (request) => {
    const page = Number(request?.query?.page) || 1;
    const limit = Number(request?.query?.limit) || 10;
    const skip = (page - 1) * limit;
    const search = request?.query?.search;
    const matchCondition = {
        is_deleted: deleteConstants.NOT_DELETED,
        isSuperAdmin: { $ne: true },
    };
    if (search) {
        const pattern = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        matchCondition.$or = [
            { fullName: { $regex: pattern, $options: "i" } },
            { email: { $regex: pattern, $options: "i" } },
        ];
    }
    const data = await adminModel.aggregate([
        {
            $match: matchCondition
        },
        {
            $lookup: {
                from: "roles",
                localField: "roleId",
                foreignField: "_id",
                as: "roleData",
                pipeline: [
                    {
                        $match: {
                            is_deleted: deleteConstants.NOT_DELETED
                        }
                    }, {
                        $project: {
                            roleName: 1,
                        }
                    }
                ]
            }

        },
        { $sort: { createdAt: -1 } },
        { $unwind: { path: "$roleData", preserveNullAndEmptyArrays: true } },
        { $project: { password: 0 } },
        helper.applyPagination(skip, limit),
    ])
    const response = {
        getData: data?.[0]?.paginatedResults || [],
        count: data?.[0]?.totalCount?.[0]?.total || 0
    };
    return response;

};
subAdminService.delete = async (request) => {
    const moduleData = await findStaff(request?.query?._id);
    await adminModel.findByIdAndUpdate(request?.query?._id, { is_deleted: deleteConstants.DELETED });
    await sessionModel.deleteMany({ adminId: request?.query?._id }).catch((err) => {
        logger.error('Failed to invalidate sessions on subadmin revoke', { message: err.message, adminId: request?.query?._id });
    });
    await createAuditLogAdmin({
        req: request,
        adminId: request?.auth._id,
        action: auditLogConstants.SUBADMINDELETED,
        entity: CollectionName.admins,
        entityId: moduleData?._id,
        fromState: "NOT_DELETED",
        toState: "DELETED",
        metadata: {
            subAdminId: moduleData._id,
            deleteType: "SOFT_DELETE"
        }
    });
};
subAdminService.status = async (request) => {
    const moduleData = await findStaff(request?.query?._id);
    if (moduleData.status === statusConstants.active) {
        await adminModel.findByIdAndUpdate(request?.query?._id, { status: statusConstants.inactive });
        await createAuditLogAdmin({
            req: request, adminId: request?.auth._id,
            action: auditLogConstants.SUBADMINSTATUSCHANGED,
            entity: CollectionName.admins,
            entityId: moduleData._id,
            fromState: statusConstants.active,
            toState: statusConstants.inactive,
            metadata: {
                subAdminId: moduleData._id,
                deleteType: "CHANGE_STATUS"
            }
        });
        await sessionModel.deleteMany({ adminId: request?.query?._id }).catch((err) => {
            logger.error('Failed to invalidate sessions on subadmin deactivation', { message: err.message, adminId: request?.query?._id });
        });
    } else {
        await adminModel.findByIdAndUpdate(request?.query?._id, { status: statusConstants.active });
        await createAuditLogAdmin({
            req: request, adminId: request?.auth._id,
            action: auditLogConstants.SUBADMINSTATUSCHANGED,
            entity: CollectionName.admins,
            entityId: moduleData._id,
            fromState: statusConstants.inactive,
            toState: statusConstants.active,
            metadata: {
                subAdminId: moduleData._id,
                deleteType: "CHANGE_STATUS"
            }
        });

    }
};
module.exports = subAdminService