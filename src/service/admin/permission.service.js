const helper = require('../../helper/helper')
const permissionModel = require('../../model/permission.model');
const statusCodes = require("../../constants/httpConstants");
const statusConstants = require("../../constants/status.constants");
const moduleModel = require('../../model/module.model');
const mongoose = require("mongoose");
const auditLogConstants = require("../../constants/auditLogConstants");
const CollectionName = require("../../constants/auditLogcollection.constant");
const { createAuditLogAdmin } = require("../../helper/audit.helper");
const deleteConstants = require("../../constants/delete.constants");
const sessionModel = require('../../model/session.model');
const permissionService = {}
permissionService.add = async (data, request) => {
    const moduleData = await moduleModel.findOne({ _id: data.moduleId, is_deleted: deleteConstants.NOT_DELETED })
    if (!moduleData) {
        throw Object.assign(new Error("Module not found exists"), { statusCode: statusCodes.BAD_REQUEST });
    }
    const existingPermission = await permissionModel.findOne({
        modulePermission: data.modulePermission,
        is_deleted: deleteConstants.NOT_DELETED,
    });
    if (existingPermission) {
        throw Object.assign(new Error("Permission already assigned"), { statusCode: statusCodes.BAD_REQUEST });
    }
    const modulePermissionInfo = await permissionModel.find({
        moduleId: data?.moduleId,
        is_deleted: deleteConstants.NOT_DELETED,
    });
    if (modulePermissionInfo.length >= 10) {
        throw Object.assign(new Error("Permission limit reached"), { statusCode: statusCodes.BAD_REQUEST });
    }
    const permission = await permissionModel.create(data);
    await createAuditLogAdmin({
        req: request, adminId:
            request?.auth._id,
        action: auditLogConstants.PERMISSIONCREATED,
        entity: CollectionName.permissions,
        entityId: permission._id, metadata: {}
    });
};
permissionService.update = async (data, request) => {
    if (!await moduleModel.findOne({ _id: data?.moduleId, is_deleted: deleteConstants.NOT_DELETED })) {
        throw Object.assign(new Error("Module not  exists"), { statusCode: statusCodes.BAD_REQUEST });
    }
    const permission = await permissionModel.findOne({ _id: data?._id, is_deleted: deleteConstants.NOT_DELETED })
    if (!permission) {
        throw Object.assign(new Error("Permission not found"), { statusCode: statusCodes.BAD_REQUEST });
    }
    if (await permissionModel.findOne({ modulePermission: data.modulePermission, moduleId: data.moduleId, _id: { $ne: data?._id }, is_deleted: deleteConstants.NOT_DELETED, })) {
        throw Object.assign(new Error("Permission name not exist"), { statusCode: statusCodes.BAD_REQUEST });
    }
    await createAuditLogAdmin({
        req: request, adminId:
            request?.auth._id,
        action: auditLogConstants.PERMISSIONUPDATED,
        entity: CollectionName.permissions,
        entityId: data?._id,
        metadata: {
            updateType: "PERMISSION_UPDATE",
            changes: {
                modulePermission: {
                    from: permission?.modulePermission,
                    to: data.modulePermission
                },
                moduleDisplayPermission: {
                    from: permission.moduleDisplayPermission,
                    to: data.moduleDisplayPermission
                },

            }
        }
    });
    await permissionModel.findByIdAndUpdate(data?._id, data);
};

permissionService.get = async (request) => {
    const page = Number(request?.query?.page) || 1;
    const limit = Number(request?.query?.limit) || 10;
    const skip = (page - 1) * limit;
    const search = request?.query?.search;
    const matchCondition = { is_deleted: deleteConstants.NOT_DELETED };
    if (search) matchCondition.$or = [{ moduleDisplayPermission: { $regex: search, $options: "i" } }, { modulePermission: { $regex: search, $options: "i" } },];
    const data = await permissionModel.aggregate([
        {
            $match: matchCondition
        },
        {
            $lookup: {
                from: "modules",
                localField: "moduleId",
                foreignField: "_id",
                as: "moduleData",
                pipeline: [
                    {
                        $match: {
                            is_deleted: deleteConstants.NOT_DELETED
                        }
                    }
                ]
            }

        },
        { $sort: { createdAt: -1 } },
        { $unwind: { path: "$moduleData", preserveNullAndEmptyArrays: true } },
        helper.applyPagination(skip, limit),
    ])
    const response = {
        getData: data?.[0]?.paginatedResults || [],
        count: data?.[0]?.totalCount?.[0]?.total || 0
    };
    return response;


};
permissionService.getAll = async (request) => {
    const matchCondition = {
        is_deleted: deleteConstants.NOT_DELETED
    };
    const data = await moduleModel.aggregate([
        {
            $match: matchCondition
        },
        {
            $lookup: {
                from: "permissions",
                localField: "_id",
                foreignField: "moduleId",
                as: "permissionData",
                pipeline: [
                    {
                        $match: {
                            is_deleted: deleteConstants.NOT_DELETED
                        }
                    }
                ]
            }

        },
        { $sort: { createdAt: -1 } },
    ])
    return data;

};
permissionService.delete = async (request) => {
    const moduleData = await permissionModel.findOne({ _id: request?.query?._id, is_deleted: deleteConstants.NOT_DELETED })
    if (!moduleData) {
        throw Object.assign(new Error("permissionModel not found"), { statusCode: statusCodes.NOT_FOUND });
    }
    await permissionModel.findByIdAndUpdate(request?.query?._id, { is_deleted: deleteConstants.DELETED });
    await createAuditLogAdmin({
        req: request,
        adminId: request?.auth._id,
        action: auditLogConstants.PERMISSIONDELETED,
        entity: CollectionName.permissions,
        entityId: moduleData?._id,
        fromState: "NOT_DELETED",
        toState: "DELETED",
        metadata: {
            permissionId: moduleData._id,
            deleteType: "SOFT_DELETE"
        }
    });
};
permissionService.status = async (request) => {
    const moduleData = await permissionModel.findOne({ _id: request?.query?._id, is_deleted: deleteConstants.NOT_DELETED })
    if (!moduleData) {
        throw Object.assign(new Error("permissionModel not found"), { statusCode: statusCodes.NOT_FOUND });
    }
    if (moduleData.status === statusConstants.active) {
        await permissionModel.findByIdAndUpdate(request?.query?._id, { status: statusConstants.inactive });
        await createAuditLogAdmin({
            req: request, adminId: request?.auth._id,
            action: auditLogConstants.PERMISSIONSTATUSCHANGED,
            entity: CollectionName.permissions,
            entityId: moduleData._id,
            fromState: statusConstants.active,
            toState: statusConstants.inactive,
            metadata: {
                permissionId: moduleData._id,
                deleteType: "CHANGE_STATUS"
            }
        });
    } else {
        await permissionModel.findByIdAndUpdate(request?.query?._id, { status: statusConstants.active });
 await createAuditLogAdmin({
            req: request, adminId: request?.auth._id,
            action: auditLogConstants.PERMISSIONSTATUSCHANGED,
            entity: CollectionName.permissions,
            entityId: moduleData._id,
            fromState: statusConstants.inactive,
            toState: statusConstants.active,
            metadata: {
                permissionId: moduleData._id,
                deleteType: "CHANGE_STATUS"
            }
        });
    }
};
module.exports = permissionService