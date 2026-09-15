const jwt = require("jsonwebtoken");
const responseConstants = require("../constants/response.constatnts");
const configenv = require("../config/env.config");
const statusConstants = require("../constants/status.constants");
const adminModel = require("../model/admin.model");
const permissionModel = require("../model/permission.model");
const statusCodes = require("../constants/httpConstants");
const mongoose = require("mongoose");
const logger = require("../logger/error.logger");
const roleModel = require("../model/role.model");
const auditLogConstants = require("../constants/auditLogConstants");
const CollectionName = require("../constants/auditLogcollection.constant");
const { createAuditLogAdmin } = require("../helper/audit.helper");
const deleteConstants = require("../constants/delete.constants");
const helper = require('../helper/helper');
const { clearAdminAuthCookie } = require('../helper/authCookie');
const permissionMiddleware = (permission) => {
    return async (request, response, nextFunction) => {
        try {
            const isFullAccess = request?.auth?.isSuperAdmin === true || request?.auth?.type === "admin";
            if (!isFullAccess) {
                const role = await roleModel.findOne({ _id: request?.auth?.roleId, is_deleted: deleteConstants.NOT_DELETED, status: statusConstants.active });
                if (!role) {
                    clearAdminAuthCookie(response);
                    await createAuditLogAdmin({
                        req: request, adminId: request?.auth?._id,
                        action: auditLogConstants.PERMISSION_DENIED,
                        entity: CollectionName.admins,
                        entityId: request?.auth?._id, metadata: {}
                    });
                    return responseConstants.unauthorized(response, "You don't have permission to access this resource", statusCodes.FORBIDDEN);
                }
                const permissions = await permissionModel.find({ _id: { $in: role.permissionIds }, is_deleted: deleteConstants.NOT_DELETED, status: statusConstants.active });
                const isPermission = permissions.some(item => item.modulePermission === permission);
                if (!isPermission) {
                    clearAdminAuthCookie(response);
                    await createAuditLogAdmin({
                        req: request, adminId: request?.auth?._id,
                        action: auditLogConstants.PERMISSION_DENIED,
                        entity: CollectionName.admins,
                        entityId: request?.auth?._id, metadata: {}
                    });
                    return responseConstants.unauthorized(response, "You don't have permission to access this resource", statusCodes.FORBIDDEN);
                }
            }
            return nextFunction();
        } catch (error) {
            nextFunction(error);
        }
    };
};

module.exports = permissionMiddleware;