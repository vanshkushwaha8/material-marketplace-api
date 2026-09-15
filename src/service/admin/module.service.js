const helper = require('../../helper/helper')
const adminModel = require('../../model/admin.model');
const statusCodes = require("../../constants/httpConstants");
const statusConstants = require("../../constants/status.constants");
const moduleModel = require('../../model/module.model');
const permissionModel = require('../../model/permission.model');
const mongoose = require("mongoose");
const auditLogConstants = require("../../constants/auditLogConstants");
const CollectionName = require("../../constants/auditLogcollection.constant");
const { createAuditLogAdmin } = require("../../helper/audit.helper");
const deleteConstants = require("../../constants/delete.constants");
const moduleService = {}
moduleService.add = async (data, request) => {
    const moduleData = await moduleModel.findOne({ moduleName: data.moduleName, is_deleted: deleteConstants.NOT_DELETED })
    if (moduleData) {
        throw Object.assign(new Error("Module already exists"), { statusCode: statusCodes.BAD_REQUEST });
    }
    const mdoule = await moduleModel.create(data);
    await createAuditLogAdmin({
        req: request, adminId: request?.auth._id,
        action: auditLogConstants.MODULECREATED,
        entity: CollectionName.modules,
        entityId: mdoule._id, metadata: {}
    });
};
moduleService.update = async (data, request) => {
    const moduleData = await moduleModel.findOne({ _id: { $ne: data._id }, moduleName: data.moduleName, is_deleted: deleteConstants.NOT_DELETED })
    if (moduleData) {
        throw Object.assign(new Error("Module already exists"), { statusCode: statusCodes.BAD_REQUEST });
    }
    const module = await moduleModel.findOne({ _id: data._id })
    await moduleModel.findByIdAndUpdate(data._id, data);
    await createAuditLogAdmin({
        req: request,
        adminId: request?.auth._id,
        action: auditLogConstants.MODULEUPDATED,
        entity: CollectionName.modules,
        entityId: module._id, metadata: {
            updateType: "MODULE_UPDATE",
            changes: {
                moduleName: {
                    from: module?.moduleName,
                    to: data.moduleName
                },
                moduleDisplayName: {
                    from: module.moduleDisplayName,
                    to: data.moduleDisplayName
                },
                route: {
                    from: module.route,
                    to: data.route
                },

            }
        }
    });

};
moduleService.get = async (request) => {
    const page = Number(request?.query?.page) || 1;
    const limit = Number(request?.query?.limit) || 10;
    const skip = (page - 1) * limit;
    const search = request?.query?.search;
    const matchCondition = {
        is_deleted: deleteConstants.NOT_DELETED
    };
    if (search) {
        matchCondition.$or = [
            { moduleName: { $regex: search, $options: "i" } },
            { moduleDisplayName: { $regex: search, $options: "i" } },
        ];
    }
    const data = await moduleModel.aggregate([
        {
            $match: matchCondition
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
moduleService.delete = async (request) => {
    const moduleData = await moduleModel.findOne({ _id: request?.query?._id, is_deleted: deleteConstants.NOT_DELETED })
    const permissionData = await permissionModel.findOne({ moduleId: request?.query?._id, is_deleted: deleteConstants.NOT_DELETED })
    if (permissionData) {
        throw Object.assign(new Error("You can't delete this module because it has associated permissions"), { statusCode: statusCodes.NOT_FOUND });
    }
    if (!moduleData) {
        throw Object.assign(new Error("Module not found"), { statusCode: statusCodes.NOT_FOUND });
    }
    await moduleModel.findByIdAndUpdate(request?.query?._id, { is_deleted: deleteConstants.DELETED });

    await createAuditLogAdmin({
        req: request,
        adminId: request?.auth._id,
        action: auditLogConstants.MODULEDELETED,
        entity: CollectionName.modules,
        entityId: moduleData._id,
        fromState: "NOT_DELETED",
        toState: "DELETED",
        metadata: {
            moduleId: moduleData._id,
            deleteType: "SOFT_DELETE"
        }
    });
};
moduleService.status = async (request) => {
    const moduleData = await moduleModel.findOne({ _id: request?.query?._id, is_deleted: deleteConstants.NOT_DELETED })
    if (!moduleData) {
        throw Object.assign(new Error("Module not found"), { statusCode: statusCodes.NOT_FOUND });
    }
    if (moduleData.status === statusConstants.active) {
        await moduleModel.findByIdAndUpdate(request?.query?._id, { status: statusConstants.inactive });
        await createAuditLogAdmin({
            req: request, adminId: request?.auth._id,
            action: auditLogConstants.MODULESTATUSCHANGED,
            entity: CollectionName.modules,
            entityId: moduleData._id,
            fromState: statusConstants.active,
            toState: statusConstants.inactive,
            metadata: {
                moduleId: moduleData._id,
                deleteType: "CHANGE_STATUS"
            }
        });
    } else {
        await moduleModel.findByIdAndUpdate(request?.query?._id, { status: statusConstants.active });
        await createAuditLogAdmin({
            req: request, adminId: request?.auth._id,
            action: auditLogConstants.MODULESTATUSCHANGED,
            entity: CollectionName.modules,
            entityId: moduleData._id,
            fromState: statusConstants.inactive,
            toState: statusConstants.active,
            metadata: {
                moduleId: moduleData._id,
                deleteType: "CHANGE_STATUS"
            }
        });

    }
};
module.exports = moduleService