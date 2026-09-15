const helper = require('../../helper/helper')
const permissionModel = require('../../model/permission.model');
const statusCodes = require("../../constants/httpConstants");
const statusConstants = require("../../constants/status.constants");
const moduleModel = require('../../model/module.model');
const roleModel = require('../../model/role.model');
const auditLogConstants = require("../../constants/auditLogConstants");
const CollectionName = require("../../constants/auditLogcollection.constant");
const { createAuditLogAdmin } = require("../../helper/audit.helper");
const adminModel = require('../../model/admin.model');
const mongoose = require("mongoose");
const deleteConstants = require("../../constants/delete.constants");
const roleService = {}
roleService.add = async (data, request) => {
    const moduleData = await roleModel.findOne({ roleName: data.roleName, is_deleted: deleteConstants.NOT_DELETED })
    if (moduleData) {
        throw Object.assign(new Error("Role already exists"), { statusCode: statusCodes.BAD_REQUEST });
    }
    const roles = await roleModel.create(data);
    await createAuditLogAdmin({
        req: request,
        adminId: request?.auth._id,
        action: auditLogConstants.ROLECREATED,
        entity: CollectionName.roles,
        entityId: roles._id, metadata: {}
    });

};
roleService.update = async (data, request) => {
    const roldeData = await roleModel.findOne({ _id: data?._id, is_deleted: deleteConstants.NOT_DELETED, })
    if (!roldeData) {
        throw Object.assign(new Error("Role not found"), { statusCode: statusCodes.NOT_FOUND });
    }
    if (await roleModel.findOne({ roleName: data.roleName, _id: { $ne: data?._id }, is_deleted: false, })) {
        throw Object.assign(new Error("Role not ALREADY EXIST"), { statusCode: statusCodes.BAD_REQUEST });
    }
    await roleModel.findByIdAndUpdate(data?._id, data);
    await createAuditLogAdmin({
        req: request,
        adminId: request?.auth._id,
        action: auditLogConstants.ROLEUPDATED,
        entity: CollectionName.roles,
        entityId: roldeData?._id,
        metadata: {
            updateType: "ROLE_UPDATE",
            changes: {
                permissionIds: {
                    from: roldeData?.permissionIds,
                    to: data.permissionIds
                },
                roleName: {
                    from: roldeData.roleName,
                    to: data.roleName
                },

            }
        }
    });

};
roleService.get = async (request) => {
    const page = Number(request?.query?.page) || 1;
    const limit = Number(request?.query?.limit) || 10;
    const skip = (page - 1) * limit;
    const search = request?.query?.search;
    const matchCondition = {
        is_deleted: deleteConstants.NOT_DELETED
    };
    if (search) {
        matchCondition.$or = [
            { roleName: { $regex: search, $options: "i" } },
        ];
    }
    const data = await roleModel.aggregate([
        {
            $match: matchCondition
        },
        {
            $lookup: {
                from: "permissions",
                localField: "permissionIds",
                foreignField: "_id",
                as: "permissionData",
                pipeline: [
                    {
                        $match: {
                            is_deleted: deleteConstants.NOT_DELETED
                        }
                    }, {
                        $project: {
                            _id: 1,
                            modulePermission: 1,
                            moduleDisplayPermission: 1,
                        }
                    }
                ]
            }

        },
        { $sort: { createdAt: -1 } },
        helper.applyPagination(skip, limit),
    ])
    const response = {
        getData: data?.[0]?.paginatedResults || [],
        count: data?.[0]?.totalCount?.[0]?.total || 0
    };
    return response;

};
roleService.delete = async (request) => {
    const moduleData = await roleModel.findOne({ _id: request?.query?._id, is_deleted: deleteConstants.NOT_DELETED })
    if (!moduleData) {
        throw Object.assign(new Error("roleModel not found"), { statusCode: statusCodes.NOT_FOUND });
    }
    const userRole = await adminModel.findOne({ roleId: request?.query?._id, is_deleted: deleteConstants.NOT_DELETED })
    if (userRole) {
        throw Object.assign(new Error("Role is assigned to another sub-admin"), { statusCode: statusCodes.CONFLICT });
    }
    await roleModel.findByIdAndUpdate(request?.query?._id, { is_deleted: deleteConstants.DELETED });
    await createAuditLogAdmin({
        req: request,
        adminId: request?.auth._id,
        action: auditLogConstants.ROLEDELETED,
        entity: CollectionName.roles,
        entityId: moduleData?._id,
        fromState: "NOT_DELETED",
        toState: "DELETED",
        metadata: {
            roleId: moduleData._id,
            deleteType: "SOFT_DELETE"
        }
    });
};
roleService.status = async (request) => {
    const moduleData = await roleModel.findOne({ _id: request?.query?._id, is_deleted: deleteConstants.NOT_DELETED })
    if (!moduleData) {
        throw Object.assign(new Error("roleModel not found"), { statusCode: statusCodes.NOT_FOUND });
    }
    if (moduleData.status === statusConstants.active) {
        await roleModel.findByIdAndUpdate(request?.query?._id, { status: statusConstants.inactive });
        await createAuditLogAdmin({
            req: request, adminId: request?.auth._id,
            action: auditLogConstants.ROLESTATUSCHANGED,
            entity: CollectionName.roles,
            entityId: moduleData._id,
            fromState: statusConstants.active,
            toState: statusConstants.inactive,
            metadata: {
                roleId: moduleData._id,
                deleteType: "CHANGE_STATUS"
            }
        });
    } else {
        await roleModel.findByIdAndUpdate(request?.query?._id, { status: statusConstants.active });
        await createAuditLogAdmin({
            req: request, adminId: request?.auth._id,
            action: auditLogConstants.ROLESTATUSCHANGED,
            entity: CollectionName.roles,
            entityId: moduleData._id,
            fromState: statusConstants.inactive,
            toState: statusConstants.active,
            metadata: {
                roleId: moduleData._id,
                deleteType: "CHANGE_STATUS"
            }
        });

    }
};
module.exports = roleService