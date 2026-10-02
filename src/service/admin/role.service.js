const helper = require('../../helper/helper');
const roleModel = require('../../model/role.model');
const adminModel = require('../../model/admin.model');
const statusCodes = require("../../constants/httpConstants");
const statusConstants = require("../../constants/status.constants");
const deleteConstants = require("../../constants/delete.constants");
const auditLogConstants = require("../../constants/auditLogConstants");
const CollectionName = require("../../constants/auditLogcollection.constant");
const { createAuditLogAdmin } = require("../../helper/audit.helper");
const { ADMIN_PERMISSION_CATALOG } = require("../../constants/rbac.constants");
const { AppError } = require("../../utils/AppError");

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function assertNameFree(roleName, exceptId = null) {
    const clash = await roleModel.findOne({
        roleName: { $regex: `^${escapeRegex(roleName)}$`, $options: 'i' },
        is_deleted: deleteConstants.NOT_DELETED,
        ...(exceptId ? { _id: { $ne: exceptId } } : {}),
    }).select('_id').lean();
    if (clash) throw new AppError("A role with this name already exists", statusCodes.CONFLICT);
}

async function findRole(id) {
    const role = await roleModel.findOne({ _id: id, is_deleted: deleteConstants.NOT_DELETED });
    if (!role) throw new AppError("Role not found", statusCodes.NOT_FOUND);
    return role;
}

const roleService = {};

roleService.catalog = () => ADMIN_PERMISSION_CATALOG;

roleService.add = async (data, request) => {
    await assertNameFree(data.roleName);
    const role = await roleModel.create({ roleName: data.roleName, description: data.description || '', permissions: data.permissions });
    await createAuditLogAdmin({
        req: request, adminId: request?.auth?._id,
        action: auditLogConstants.ROLECREATED,
        entity: CollectionName.roles, entityId: role._id,
        metadata: { roleName: role.roleName, permissions: role.permissions },
    });
    return role;
};

roleService.update = async (data, request) => {
    const role = await findRole(data._id);
    await assertNameFree(data.roleName, role._id);
    const before = { roleName: role.roleName, permissions: [...role.permissions] };
    role.roleName = data.roleName;
    role.description = data.description ?? role.description;
    role.permissions = data.permissions;
    await role.save();
    // Effective immediately: permissions are resolved from the role on every
    // request, so staff on this role get the new set on their next call.
    await createAuditLogAdmin({
        req: request, adminId: request?.auth?._id,
        action: auditLogConstants.ROLEUPDATED,
        entity: CollectionName.roles, entityId: role._id,
        metadata: {
            updateType: "ROLE_UPDATE",
            changes: {
                roleName: { from: before.roleName, to: role.roleName },
                permissions: {
                    added: role.permissions.filter((p) => !before.permissions.includes(p)),
                    removed: before.permissions.filter((p) => !role.permissions.includes(p)),
                },
            },
        },
    });
    return role;
};

roleService.get = async (request) => {
    const page = Math.max(1, Number(request?.query?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(request?.query?.limit) || 10));
    const skip = (page - 1) * limit;
    const search = request?.query?.search;
    const matchCondition = { is_deleted: deleteConstants.NOT_DELETED };
    if (search) matchCondition.roleName = { $regex: escapeRegex(search), $options: "i" };
    const data = await roleModel.aggregate([
        { $match: matchCondition },
        {
            $lookup: {
                from: "admins",
                localField: "_id",
                foreignField: "roleId",
                as: "members",
                pipeline: [{ $match: { is_deleted: deleteConstants.NOT_DELETED } }, { $project: { _id: 1 } }],
            },
        },
        { $addFields: { memberCount: { $size: "$members" } } },
        { $project: { members: 0 } },
        { $sort: { createdAt: -1 } },
        helper.applyPagination(skip, limit),
    ]);
    return {
        getData: data?.[0]?.paginatedResults || [],
        count: data?.[0]?.totalCount?.[0]?.total || 0,
    };
};

roleService.delete = async (request) => {
    const role = await findRole(request?.query?._id);
    const assigned = await adminModel.exists({ roleId: role._id, is_deleted: deleteConstants.NOT_DELETED });
    if (assigned) throw new AppError("This role is assigned to staff — reassign them first", statusCodes.CONFLICT);
    role.is_deleted = deleteConstants.DELETED;
    await role.save();
    await createAuditLogAdmin({
        req: request, adminId: request?.auth?._id,
        action: auditLogConstants.ROLEDELETED,
        entity: CollectionName.roles, entityId: role._id,
        fromState: "NOT_DELETED", toState: "DELETED",
        metadata: { roleId: role._id, deleteType: "SOFT_DELETE" },
    });
};

// Deactivating a role removes every permission from its staff at once
// (resolution fails closed on an inactive role).
roleService.status = async (request) => {
    const role = await findRole(request?.query?._id);
    const from = role.status;
    role.status = from === statusConstants.active ? statusConstants.inactive : statusConstants.active;
    await role.save();
    await createAuditLogAdmin({
        req: request, adminId: request?.auth?._id,
        action: auditLogConstants.ROLESTATUSCHANGED,
        entity: CollectionName.roles, entityId: role._id,
        fromState: from, toState: role.status,
        metadata: { roleId: role._id, deleteType: "CHANGE_STATUS" },
    });
    return role;
};

module.exports = roleService;
