const helper = require('../../helper/helper')
const adminModel = require('../../model/admin.model');
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const deleteConstants = require("../../constants/delete.constants")
const sendEmail = require("../../helper/sendVerificationEmail");
const emailTemplateImage = require("../../config/template");
const otpModel = require('../../model/otp.model');
const permissionModel = require('../../model/permission.model');
const statusConstants = require("../../constants/status.constants");
const roleModel = require('../../model/role.model');
const statusCodes = require("../../constants/httpConstants");
const logger = require('../../logger/error.logger');
const authService = {}

authService.login = async (data) => {
    if (data?.isPasswordSet === false) {
        throw Object.assign(new Error("Password not set"), { statusCode: statusCodes.BAD_REQUEST });
    }
    const loginTime = new Date();
    const user = data.toObject();
    user.inactivityDate = loginTime;
    const [token] = await Promise.all([helper.generateTokken(user), adminModel.updateOne({ _id: data._id }, { $set: { inactivityDate: loginTime } }),]);
    user.token = token;
    delete user.password;
    if (data?.isSuperAdmin && data?.type == "admin") return user;
    const role = await roleModel.findOne({ _id: user.roleId, is_deleted: deleteConstants.NOT_DELETED, status: statusConstants.active, });
    if (!role) {
        throw Object.assign(new Error("You are not assigned to any role"), { statusCode: statusCodes.BAD_REQUEST });
    }
    const permissions = await permissionModel.find({ _id: { $in: role.permissionIds }, is_deleted: deleteConstants.NOT_DELETED, status: statusConstants.active, }).populate({ path: "moduleId", select: "moduleName route moduleDisplayName" });
    const modules = permissions.reduce((acc, p) => {
        const moduleId = p.moduleId._id;
        if (!acc[moduleId]) {
            acc[moduleId] = { moduleId: p.moduleId._id, moduleName: p.moduleId.moduleName, route: p.moduleId.route, moduleDisplayName: p.moduleId.moduleDisplayName, permissions: [], };
        }
        acc[moduleId].permissions.push({ permissionId: p._id, permission: p.modulePermission, displayName: p.moduleDisplayPermission, });
        return acc;
    }, {});
    user.modules = Object.values(modules);
    return user;
};

authService.changePassword = async (request) => {
    const hashPassword = await helper.createPassword(request.body.newPassword);
    await adminModel.findByIdAndUpdate(
        { _id: request?.auth?._id },
        { password: hashPassword }
    );
};


authService.updateProfile = async (request) => {
    const userId = request?.auth?._id;
    const data = await adminModel.findOneAndUpdate(
        { _id: userId, is_deleted: deleteConstants.NOT_DELETED },
        { $set: { fullName: request.body.fullName } },
        { new: true }
    ).select("fullName profilePicture email type isSuperAdmin roleId mfaEnabled");
    return data;
};

authService.getProfile = async (request) => {
    const userId = request?.auth?._id || request?.query?._id;
    const data = await adminModel.findOne({ _id: userId, is_deleted: deleteConstants.NOT_DELETED }).select("fullName profilePicture email type isSuperAdmin roleId mfaEnabled");
    if (!data) return data;
    const user = data.toObject();
    if (user.isSuperAdmin && user.type === "admin") return user;
    const role = await roleModel.findOne({ _id: user.roleId, is_deleted: deleteConstants.NOT_DELETED, status: statusConstants.active });
    if (!role) return user;
    const permissions = await permissionModel.find({ _id: { $in: role.permissionIds }, is_deleted: deleteConstants.NOT_DELETED, status: statusConstants.active }).populate({ path: "moduleId", select: "moduleName route moduleDisplayName" });
    const modules = permissions.reduce((acc, p) => {
        const moduleId = p.moduleId._id;
        if (!acc[moduleId]) {
            acc[moduleId] = { moduleId: p.moduleId._id, moduleName: p.moduleId.moduleName, route: p.moduleId.route, moduleDisplayName: p.moduleId.moduleDisplayName, permissions: [] };
        }
        acc[moduleId].permissions.push({ permissionId: p._id, permission: p.modulePermission, displayName: p.moduleDisplayPermission });
        return acc;
    }, {});
    user.modules = Object.values(modules);
    return user;
};
module.exports = authService