const statusConstants = require('../constants/status.constants');
const deleteConstants = require('../constants/delete.constants');
const roleModel = require('../model/role.model');
const permissionModel = require('../model/permission.model');

/**
 * OPL-345 AC3 — "KYC status, portfolio and communications are viewable per
 * role permissions." That's three independent checks inside ONE drill-down
 * response, which permission.middleware.js can't express — it's a
 * per-route, single-permission gate. This is the same ownership/lookup
 * logic pulled out so it can be called more than once per request without
 * duplicating it.
 *
 * A super admin / full-access admin (same check permission.middleware.js
 * uses) implicitly has every permission.
 */
async function hasPermission(auth, permissionKey) {
  const isFullAccess = auth?.isSuperAdmin === true || auth?.type === 'admin';
  if (isFullAccess) return true;

  const role = await roleModel.findOne({
    _id: auth?.roleId,
    is_deleted: deleteConstants.NOT_DELETED,
    status: statusConstants.active,
  });
  if (!role) return false;

  const permissions = await permissionModel.find({
    _id: { $in: role.permissionIds },
    is_deleted: deleteConstants.NOT_DELETED,
    status: statusConstants.active,
  });
  return permissions.some((p) => p.modulePermission === permissionKey);
}

module.exports = { hasPermission };
