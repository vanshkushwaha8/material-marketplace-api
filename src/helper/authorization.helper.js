// Central permission resolution for both auth realms — the ONLY place that
// decides what a principal may do. Middleware (authorize.middleware.js),
// controllers with per-action rules (admin escrow), admin notifications and
// the profile endpoints all go through here, so there is one answer.
//
// Fail closed: an unknown role, a missing/inactive staff role or an unknown
// permission key resolves to "no permission". A database failure throws
// (→ 500 via the global error handler) — it never grants access.

const roleModel = require('../model/role.model');
const statusConstants = require('../constants/status.constants');
const deleteConstants = require('../constants/delete.constants');
const { ForbiddenError } = require('../utils/AppError');
const {
  ROLES,
  USER_ROLE_PERMISSIONS,
  ALL_ADMIN_PERMISSIONS,
  ASSIGNABLE_ADMIN_PERMISSIONS,
} = require('../constants/rbac.constants');

const REALMS = Object.freeze({ USER: 'user', ADMIN: 'admin' });
const FORBIDDEN_MESSAGE = 'You do not have permission to perform this action';

// Both flags are set only on the account created by config/db.js; staff
// accounts are always type 'subadmin' / isSuperAdmin false.
function isSuperAdmin(admin) {
  return admin?.isSuperAdmin === true && admin?.type === 'admin';
}

/**
 * @returns {Promise<{ realm, role, roleId, roleName, permissions: Set<string> }>}
 */
async function resolveAccess(auth, realm) {
  if (realm === REALMS.USER) {
    const granted = USER_ROLE_PERMISSIONS[auth?.userType];
    return { realm, role: granted ? auth.userType : null, roleId: null, roleName: granted ? auth.userType : null, permissions: new Set(granted || []) };
  }
  if (realm === REALMS.ADMIN) {
    if (isSuperAdmin(auth)) {
      return { realm, role: ROLES.SUPER_ADMIN, roleId: null, roleName: 'Super Admin', permissions: new Set(ALL_ADMIN_PERMISSIONS) };
    }
    if (!auth?.roleId) return { realm, role: null, roleId: null, roleName: null, permissions: new Set() };
    const role = await roleModel.findOne({
      _id: auth.roleId,
      status: statusConstants.active,
      is_deleted: deleteConstants.NOT_DELETED,
    }).select('roleName permissions').lean();
    if (!role) return { realm, role: null, roleId: null, roleName: null, permissions: new Set() };
    // Only catalog keys count — a stale/unknown or reserved key stored on a
    // role (old data, manual DB edit) grants nothing.
    const permissions = new Set((role.permissions || []).filter((k) => ASSIGNABLE_ADMIN_PERMISSIONS.includes(k)));
    return { realm, role: 'STAFF', roleId: role._id, roleName: role.roleName, permissions };
  }
  return { realm: null, role: null, roleId: null, roleName: null, permissions: new Set() };
}

// Resolved once per request and reused by every check in that request.
async function accessFor(request) {
  if (!request?.auth || !request?.authRealm) return null;
  if (!request.authz) request.authz = await resolveAccess(request.auth, request.authRealm);
  return request.authz;
}

function hasAll(access, permissions) {
  return !!access && permissions.length > 0 && permissions.every((p) => access.permissions.has(p));
}

function hasAny(access, permissions) {
  return !!access && permissions.some((p) => access.permissions.has(p));
}

/** For controllers whose rule depends on the request body (e.g. an escrow action). */
async function assertCan(request, ...permissions) {
  const access = await accessFor(request);
  if (!hasAll(access, permissions)) throw new ForbiddenError(FORBIDDEN_MESSAGE);
}

/** Safe-to-expose summary for the client (drives UI only, never trusted back). */
function describeAccess(access) {
  return {
    role: access?.role || null,
    roleName: access?.roleName || null,
    permissions: access ? [...access.permissions].sort() : [],
  };
}

module.exports = {
  REALMS,
  FORBIDDEN_MESSAGE,
  isSuperAdmin,
  resolveAccess,
  accessFor,
  hasAll,
  hasAny,
  assertCan,
  describeAccess,
};
