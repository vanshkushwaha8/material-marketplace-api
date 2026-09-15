const helper = require('../../helper/helper')
const adminModel = require('../../model/admin.model');
const roleModel = require('../../model/role.model');
const { createAuditLogAdmin } = require("../../helper/audit.helper");
const sendEmail = require("../../helper/sendVerificationEmail");
const passwordResetModel = require('../../model/passwordReset.model');
const passwordService = require("../app/password.service")
const statusCodes = require("../../constants/httpConstants");
const auditLogConstants = require("../../constants/auditLogConstants");

const CollectionName = require("../../constants/auditLogcollection.constant");
const statusConstants = require("../../constants/status.constants");
const moduleModel = require('../../model/module.model');
const sessionModel = require('../../model/session.model');
const configenv = require('../../config/env.config');
const sendInviteAdmin = require("../../templates/InviteAdmin")
const crypto = require('crypto')
const mongoose = require("mongoose");
const path = require("path")
const fs = require("fs")
const deleteConstants = require("../../constants/delete.constants");
const subAdminService = {}
subAdminService.add = async (data, request) => {
    if (await adminModel.findOne({ email: data.email, is_deleted: deleteConstants.NOT_DELETED })) {
        throw Object.assign(new Error("Email already exist"), { statusCode: statusCodes.CONFLICT });
    }
    if (data?.profilePicture) {
        await helper.moveFileFromFolder(data.profilePicture, 'admin')
    }
    const userData = await adminModel.create(data);
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = helper.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + (24 * 60 * 60 * 1000));
    await passwordResetModel.create({ adminId: userData._id, tokenHash, expiresAt });
    const roleInfo = await roleModel.findOne({ _id: userData?.roleId, is_deleted: deleteConstants.NOT_DELETED, status: statusConstants.active });
    const subject = "Opalus Admin Console Invitation";
    const verifyUrl = `${configenv.FRONTEND_URL}/sub-admins/set-password?token=${rawToken}`;
    const tokkendData = {
        name: userData?.fullName,
        email: userData?.email,
        roleName: roleInfo?.roleName,
        inviteUrl: verifyUrl
    }
    const html = await sendInviteAdmin(tokkendData);
    sendEmail(userData?.email, subject, html);
    await createAuditLogAdmin({
        req: request,
        adminId: request?.auth._id,
        action: auditLogConstants.SUBADMINCREATED,
        entity: CollectionName.admins,
        entityId: userData._id, metadata: {
            SUBADMINS: "SUBADMIN_ADD",
            info: tokkendData
        }
    });
};
subAdminService.resend = async (request) => {
    const userData = await adminModel.findOne({ _id: request?.query?._id });
    if (!userData) {
        throw Object.assign(new Error("sub-admin not found"), { statusCode: statusCodes.NOT_FOUND });
    }
    if (userData?.invitation == "accepted") {
        throw Object.assign(new Error("sub-admin already accepeted invitation"), { statusCode: statusCodes.BAD_REQUEST });
    }
    const existingInvitation = await passwordResetModel.findOne({ adminId: userData._id, expiresAt: { $gt: new Date() } });
    if (existingInvitation) {
        throw Object.assign(new Error("Sub-admin invitation already sent"), { statusCode: statusCodes.BAD_REQUEST });
    }
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = helper.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + (24 * 60 * 60 * 1000));
    await passwordResetModel.create({ adminId: request?.query?._id, tokenHash, expiresAt });
    const roleInfo = await roleModel.findOne({ _id: userData?.roleId, is_deleted: deleteConstants.NOT_DELETED, status: statusConstants.active });
    const subject = "Opalus Admin Console Invitation";
    const verifyUrl = `${configenv.FRONTEND_URL}/sub-admins/set-password?token=${rawToken}`;
    const tokkendData = {
        name: userData?.fullName,
        email: userData?.email,
        roleName: roleInfo?.roleName,
        inviteUrl: verifyUrl
    }
    const html = await sendInviteAdmin(tokkendData);
    sendEmail(userData?.email, subject, html);
    await createAuditLogAdmin({
        req: request,
        adminId: request?.auth._id,
        action: auditLogConstants.SUBADMININVITERESEND,
        entity: CollectionName.admins,
        entityId: userData._id, metadata: {
            SUBADMINS: "SUBADMIN_INVITE_RESEND",
            info: tokkendData
        }
    });
};
subAdminService.update = async (data, request) => {
    const admin = await adminModel.findOne({ _id: data?._id, is_deleted: deleteConstants.NOT_DELETED });
    if (!admin) {
        throw Object.assign(new Error("Sub admin not found"), { statusCode: statusCodes.NOT_FOUND });
    }
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
    await adminModel.findByIdAndUpdate(data?._id, data);
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
subAdminService.passwordSet = async (request) => {
    const tokenHash = await helper.hashToken(request?.body?.token);
    const verificationData = await passwordResetModel.findOne({ tokenHash: tokenHash });
    if (!verificationData) {
        throw Object.assign(new Error("Invalid or expired token"), { statusCode: statusCodes.BAD_REQUEST });
    }
    const userInfp = await adminModel.findOne({ _id: verificationData?.adminId })
    if (verificationData.used) {
        await createAuditLogAdmin({ req: request, adminId: verificationData?.adminId, action: auditLogConstants.PASSWORD_RESET_LINK_ALREADY_USED, entity: "SUBADMIN", entityId: verificationData?.adminId });
        throw Object.assign(new Error("Invalid or expired token"), { statusCode: statusCodes.BAD_REQUEST });

    }
    if (verificationData.expiresAt < new Date()) {
        await createAuditLogAdmin({ req: request, adminId: verificationData?.adminId, action: auditLogConstants.PASSWORD_RESET_LINK_EXPIRED, entity: "SUBADMIN", entityId: verificationData?.adminId });
        throw Object.assign(new Error("Invalid or expired token"), { statusCode: statusCodes.BAD_REQUEST });

    }
    request.body.newPassword = await helper.createPassword(request.body.newPassword);
    await adminModel.findByIdAndUpdate({ _id: verificationData?.adminId }, { password: request?.body?.newPassword, failedLoginAttempts: 0, lockUntil: null, lastFailedLoginAt: null, isPasswordSet: true, invitation: "accepted" });
    await passwordResetModel.updateMany({ adminId: verificationData?.adminId, used: false }, { $set: { used: true } });
    await helper.AdmindeleteSession(verificationData?.adminId);
    const userData = {
        fullName: userInfp?.fullName,
        email: userInfp?.email,
    }
    await passwordService.sendPasswordChangedNotice(userData);
    await createAuditLogAdmin({
        req: request,
        adminId: verificationData?.adminId,
        action: auditLogConstants.PASSWORDSET,
        entity: CollectionName.admins,
        entityId: verificationData?.adminId,
        metadata: {
            updateType: "PASSWORD_SET",
            method: "EMAIL_VERIFICATION"
        }
    });
}
subAdminService.get = async (request) => {
    const page = Number(request?.query?.page) || 1;
    const limit = Number(request?.query?.limit) || 10;
    const skip = (page - 1) * limit;
    const search = request?.query?.search;
    const matchCondition = {
        is_deleted: deleteConstants.NOT_DELETED,
        isSuperAdmin: false,
    };
    if (search) {
        matchCondition.$or = [
            { roleName: { $regex: search, $options: "i" } },
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
    const moduleData = await adminModel.findOne({ _id: request?.query?._id, is_deleted: deleteConstants.NOT_DELETED })
    if (!moduleData) {
        throw Object.assign(new Error("subadmin not found"), { statusCode: statusCodes.NOT_FOUND });
    }
    else if (moduleData?.isSuperAdmin) {
        throw Object.assign(new Error("Ops you can't delete super admin"), { statusCode: statusCodes.FORBIDDEN });
    }
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
    const moduleData = await adminModel.findOne({ _id: request?.query?._id, is_deleted: deleteConstants.NOT_DELETED })
    if (!moduleData) {
        throw Object.assign(new Error("sub-admin not found"), { statusCode: statusCodes.NOT_FOUND });
    }
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