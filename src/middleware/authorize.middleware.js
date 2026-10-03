// Route-level permission gate. Always placed AFTER the realm's
// authentication middleware (authMiddleware for buyers/sellers,
// adminMiddleWare for admins), which sets request.auth + request.authRealm.
//
//   authorize(P.A, P.B)     → needs ALL listed permissions
//   authorizeAny(P.A, P.B)  → needs AT LEAST ONE
//
// 401 = no authenticated principal, 403 = authenticated but not allowed.
// Resource ownership is checked afterwards, in the service.

const responseConstants = require('../constants/response.constatnts');
const statusCodes = require('../constants/httpConstants');
const auditLogConstants = require('../constants/auditLogConstants');
const CollectionName = require('../constants/auditLogcollection.constant');
const { createAuditLog, createAuditLogAdmin } = require('../helper/audit.helper');
const { ALL_USER_PERMISSIONS, ALL_ADMIN_PERMISSIONS } = require('../constants/rbac.constants');
const { REALMS, FORBIDDEN_MESSAGE, accessFor, hasAll, hasAny } = require('../helper/authorization.helper');

const KNOWN = new Set([...ALL_USER_PERMISSIONS, ...ALL_ADMIN_PERMISSIONS]);

// A typo'd / removed permission on a route is a programming error: crash at
// startup instead of silently denying (or worse, allowing) at runtime.
function assertKnown(permissions) {
  if (!permissions.length) throw new Error('authorize() needs at least one permission');
  const unknown = permissions.filter((p) => !KNOWN.has(p));
  if (unknown.length) throw new Error(`authorize(): unknown permission(s) ${unknown.join(', ')}`);
}

function auditDenied(request, permissions) {
  const metadata = { required: permissions, method: request.method, path: request.originalUrl?.split('?')[0] };
  if (request.authRealm === REALMS.ADMIN) {
    return createAuditLogAdmin({ req: request, adminId: request.auth?._id, action: auditLogConstants.PERMISSION_DENIED, entity: CollectionName.admins, entityId: request.auth?._id, metadata });
  }
  return createAuditLog({ req: request, userId: request.auth?._id, action: auditLogConstants.ROLE_ACCESS_DENIED, entity: CollectionName.users, entityId: request.auth?._id, metadata });
}

function gate(permissions, check) {
  assertKnown(permissions);
  const middleware = async (request, response, nextFunction) => {
    try {
      const access = await accessFor(request);
      if (!access) return responseConstants.unauthorized(response, 'Authentication required', statusCodes.UNAUTHORIZED);
      if (check(access, permissions)) return nextFunction();
      await auditDenied(request, permissions);
      return responseConstants.Forbidden(response, FORBIDDEN_MESSAGE);
    } catch (error) {
      // Could not determine access (e.g. DB down) → 500, never a pass.
      return nextFunction(error);
    }
  };
  // Read by the route-table test (__tests__/rbac.routes.test.js).
  middleware.rbac = { permissions, mode: check === hasAll ? 'all' : 'any' };
  return middleware;
}

const authorize = (...permissions) => gate(permissions, hasAll);
const authorizeAny = (...permissions) => gate(permissions, hasAny);

module.exports = { authorize, authorizeAny };
