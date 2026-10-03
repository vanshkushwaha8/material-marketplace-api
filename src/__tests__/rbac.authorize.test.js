/**
 * Behaviour of the central authorization layer: 401 vs 403 vs 500, the
 * fail-closed cases, super admin vs staff resolution, reserved permissions,
 * per-request memoisation, and the per-action payment rules.
 */
jest.mock('../model/role.model', () => ({ findOne: jest.fn() }));
jest.mock('../helper/audit.helper', () => ({
  createAuditLog: jest.fn().mockResolvedValue(null),
  createAuditLogAdmin: jest.fn().mockResolvedValue(null),
}));

const roleModel = require('../model/role.model');
const audit = require('../helper/audit.helper');
const { authorize, authorizeAny } = require('../middleware/authorize.middleware');
const { resolveAccess, isSuperAdmin } = require('../helper/authorization.helper');
const { USER_PERMISSIONS: U, ADMIN_PERMISSIONS: A } = require('../constants/rbac.constants');
const RoleValidation = require('../validation/admin/role.validation');

const roleQuery = (doc) => ({ select: () => ({ lean: () => (doc instanceof Error ? Promise.reject(doc) : Promise.resolve(doc)) }) });
const res = () => {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
};
const run = async (mw, request) => {
  const response = res();
  const next = jest.fn();
  await mw(request, response, next);
  return { response, next, status: response.status.mock.calls[0]?.[0], body: response.json.mock.calls[0]?.[0] };
};
const user = (userType, extra = {}) => ({ auth: { _id: 'u1', userType, ...extra }, authRealm: 'user', method: 'GET', originalUrl: '/x' });
const SUPER = { _id: 'a0', type: 'admin', isSuperAdmin: true };
const staff = (roleId = 'r1') => ({ auth: { _id: 'a1', type: 'subadmin', isSuperAdmin: false, roleId }, authRealm: 'admin', method: 'POST', originalUrl: '/admin/x' });

beforeEach(() => jest.clearAllMocks());

describe('authorize() — status codes and response format', () => {
  test('no authenticated principal → 401 Authentication required', async () => {
    const { status, body, next } = await run(authorize(U.LISTING_MANAGE), { method: 'GET' });
    expect(status).toBe(401);
    expect(body).toEqual({ status: false, message: 'Authentication required', data: null });
    expect(next).not.toHaveBeenCalled();
  });

  test('buyer calling a seller-only action → 403 + audited', async () => {
    const { status, body, next } = await run(authorize(U.LISTING_MANAGE), user('Buyer'));
    expect(status).toBe(403);
    expect(body).toEqual({ status: false, message: 'You do not have permission to perform this action', data: null });
    expect(next).not.toHaveBeenCalled();
    expect(audit.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'ROLE_ACCESS_DENIED' }));
  });

  test('seller → seller action allowed (INDIVIDUAL and BUSINESS_STORE alike)', async () => {
    for (const sellerType of ['INDIVIDUAL', 'BUSINESS_STORE', null]) {
      const { next, status } = await run(authorize(U.LISTING_MANAGE), user('Seller', { sellerType }));
      expect(next).toHaveBeenCalledWith();
      expect(status).toBeUndefined();
    }
  });

  test('seller cannot use buyer-only actions (offer:create, payment:create)', async () => {
    expect((await run(authorize(U.OFFER_CREATE), user('Seller'))).status).toBe(403);
    expect((await run(authorize(U.PAYMENT_CREATE), user('Seller'))).status).toBe(403);
  });

  test('unknown / missing marketplace role → 403 (fail closed)', async () => {
    expect((await run(authorize(U.ACCOUNT_MANAGE), user('ComplianceOfficer'))).status).toBe(403);
    expect((await run(authorize(U.ACCOUNT_MANAGE), user(undefined))).status).toBe(403);
  });

  test('authorization lookup failure → next(error) (→ 500), never a pass', async () => {
    roleModel.findOne.mockReturnValue(roleQuery(new Error('db down')));
    const { next, status } = await run(authorize(A.PAYMENT_READ), staff());
    expect(status).toBeUndefined();
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  test('unknown permission key on a route fails at startup', () => {
    expect(() => authorize('payment:approve_everything')).toThrow(/unknown permission/);
    expect(() => authorize()).toThrow(/at least one/);
  });

  test('authorizeAny needs one, authorize needs all', async () => {
    roleModel.findOne.mockReturnValue(roleQuery({ _id: 'r1', roleName: 'Refunds', permissions: [A.PAYMENT_REFUND] }));
    expect((await run(authorizeAny(A.PAYMENT_RELEASE, A.PAYMENT_REFUND), staff())).next).toHaveBeenCalledWith();
    expect((await run(authorize(A.PAYMENT_RELEASE, A.PAYMENT_REFUND), staff())).status).toBe(403);
  });
});

describe('admin realm resolution', () => {
  test('Super Admin holds every admin permission incl. reserved ones', async () => {
    const access = await resolveAccess(SUPER, 'admin');
    expect(access.role).toBe('SUPER_ADMIN');
    expect(access.permissions.has(A.STAFF_MANAGE)).toBe(true);
    expect(access.permissions.has(A.COMMISSION_UPDATE)).toBe(true);
    expect(roleModel.findOne).not.toHaveBeenCalled();
  });

  test('isSuperAdmin flag alone (type subadmin) is NOT super admin', () => {
    expect(isSuperAdmin({ type: 'subadmin', isSuperAdmin: true })).toBe(false);
    expect(isSuperAdmin({ type: 'admin', isSuperAdmin: false })).toBe(false);
  });

  test('staff get exactly their role permissions', async () => {
    roleModel.findOne.mockReturnValue(roleQuery({ _id: 'r1', roleName: 'Finance', permissions: [A.PAYMENT_READ, A.COMMISSION_READ] }));
    expect((await run(authorize(A.PAYMENT_READ), staff())).next).toHaveBeenCalledWith();
    roleModel.findOne.mockReturnValue(roleQuery({ _id: 'r1', roleName: 'Finance', permissions: [A.PAYMENT_READ, A.COMMISSION_READ] }));
    const denied = await run(authorize(A.COMMISSION_UPDATE), staff());
    expect(denied.status).toBe(403);
    expect(audit.createAuditLogAdmin).toHaveBeenCalledWith(expect.objectContaining({ action: 'PERMISSION_DENIED' }));
  });

  test('reserved or unknown keys stored on a role grant nothing (tampered DB)', async () => {
    roleModel.findOne.mockReturnValue(roleQuery({ _id: 'r1', roleName: 'Sneaky', permissions: [A.STAFF_MANAGE, A.ROLE_MANAGE, 'manageKycReviewDecide'] }));
    const access = await resolveAccess(staff().auth, 'admin');
    expect([...access.permissions]).toEqual([]);
  });

  test('inactive/deleted role or no role → no permissions (403)', async () => {
    roleModel.findOne.mockReturnValue(roleQuery(null));
    expect((await run(authorize(A.DASHBOARD_READ), staff())).status).toBe(403);
    expect((await run(authorize(A.DASHBOARD_READ), staff(null))).status).toBe(403);
  });

  test('marketplace permission on an admin request → 403 (realms never mix)', async () => {
    expect((await run(authorize(U.LISTING_MANAGE), { auth: SUPER, authRealm: 'admin' })).status).toBe(403);
  });

  test('admin permission on a marketplace request → 403', async () => {
    expect((await run(authorize(A.USER_MANAGE), user('Seller'))).status).toBe(403);
  });

  test('access is resolved once per request', async () => {
    roleModel.findOne.mockReturnValue(roleQuery({ _id: 'r1', roleName: 'Ops', permissions: [A.USER_READ, A.USER_MANAGE] }));
    const request = staff();
    await run(authorize(A.USER_READ), request);
    await run(authorize(A.USER_MANAGE), request);
    expect(roleModel.findOne).toHaveBeenCalledTimes(1);
  });
});

describe('role validation', () => {
  test('rejects reserved and unknown keys, accepts catalog keys', () => {
    expect(RoleValidation.validateAdd({ roleName: 'X', permissions: [A.STAFF_MANAGE] }).error).toBeTruthy();
    expect(RoleValidation.validateAdd({ roleName: 'X', permissions: ['manageKycReviewView'] }).error).toBeTruthy();
    expect(RoleValidation.validateAdd({ roleName: 'X', permissions: [] }).error).toBeTruthy();
    expect(RoleValidation.validateAdd({ roleName: 'X', permissions: [A.PAYMENT_READ, A.PAYMENT_READ] }).error).toBeTruthy();
    expect(RoleValidation.validateAdd({ roleName: 'Finance', permissions: [A.PAYMENT_READ] }).error).toBeFalsy();
  });
});
