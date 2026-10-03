/**
 * Route-table RBAC test. Walks the real Express routers and pins, for EVERY
 * route, how it is protected. A new route — or a changed rule — fails here
 * until this table is updated on purpose, so access can't drift silently.
 *
 * App routes are pinned to the marketplace ROLES that end up allowed (so a
 * permission-matrix change that widens access is caught); admin routes are
 * pinned to their exact permission rule.
 */

const adminMiddleWare = require('../middleware/admin.middleware');
const { softAuthMiddleware } = require('../middleware/auth.middleware');
const { USER_ROLE_PERMISSIONS, RESERVED_ADMIN_PERMISSIONS, ASSIGNABLE_ADMIN_PERMISSIONS, ALL_ADMIN_PERMISSIONS } = require('../constants/rbac.constants');

function walk(router, out = []) {
  for (const layer of router.stack) {
    if (layer.route) {
      const fns = layer.route.stack.map((l) => l.handle);
      const auth = fns.includes(adminMiddleWare) ? 'admin'
        : fns.some((f) => f.authRealm === 'user') ? 'user'
          : fns.includes(softAuthMiddleware) ? 'soft' : 'public';
      const rules = fns.filter((f) => f.rbac).map((f) => f.rbac);
      // auth must run before any permission gate
      const authIdx = fns.findIndex((f) => f === adminMiddleWare || f.authRealm === 'user');
      const ruleIdx = fns.findIndex((f) => f.rbac);
      for (const m of Object.keys(layer.route.methods)) {
        out.push({ key: `${m.toUpperCase()} ${layer.route.path}`, auth, rules, ordered: ruleIdx === -1 || (authIdx !== -1 && authIdx < ruleIdx) });
      }
    } else if (layer.handle?.stack) walk(layer.handle, out);
  }
  return out;
}

const rolesAllowed = (rules) => Object.keys(USER_ROLE_PERMISSIONS).filter((role) => rules.every((r) => {
  const held = USER_ROLE_PERMISSIONS[role];
  return r.mode === 'all' ? r.permissions.every((p) => held.includes(p)) : r.permissions.some((p) => held.includes(p));
})).sort().join('+');

// ---- expected: marketplace (/api/v1) --------------------------------------
const B = 'Buyer', S = 'Seller', BS = 'Buyer+Seller';
const APP = {
  // public
  'POST /register': 'public', 'POST /login': 'public', 'POST /google-login': 'public',
  'GET /emailVerification': 'public', 'POST /resend-verification': 'public',
  'GET /validate-reset-token': 'public', 'POST /2fa/login/send-email': 'public', 'POST /2fa/login/verify': 'public',
  'POST /2fa/login/recovery': 'public', 'GET /userconsent/get': 'public', 'POST /request/password': 'public',
  'POST /reset/password': 'public', 'GET /config': 'public', 'GET /sitemap.xml': 'public',
  'GET /material-categories': 'public', 'GET /business-types': 'public', 'GET /material-listings': 'public',
  'POST /payments/webhook/razorpay': 'public', 'GET /stores/:sellerId': 'public', 'GET /stores/:sellerId/products': 'public',
  'GET /sellers/:sellerId/reviews': 'public', 'GET /nearby/sellers': 'public',
  'GET /material-listings/:id': 'soft', 'GET /sellers/:sellerId/follow-status': 'soft',
  // authenticated, no extra permission (any valid marketplace role)
  'POST /logout': 'signed-in', 'POST /accept-consent': 'signed-in',
  // account
  'POST /updateProfile': BS, 'POST /changePassword': BS, 'POST /accountDelete': BS, 'GET /account-deletion/check': BS, 'POST /session/delete-others': BS, 'GET /get-profile': BS,
  'GET /consent/profile': BS, 'POST /session/delete': BS, 'GET /session/get': BS,
  'POST /2fa/totp/provision': BS, 'POST /2fa/totp/verify-setup': BS, 'POST /2fa/email/initiate': BS,
  'POST /2fa/email/verify-setup': BS, 'POST /2fa/acknowledge-recovery': BS, 'POST /2fa/switch-method': BS,
  'POST /2fa/recovery/regenerate': BS, 'POST /2fa/email/send-code': BS, 'GET /2fa/status': BS,
  'POST /2fa/disable/initiate': BS, 'POST /2fa/disable/confirm': BS,
  'GET /notifications': BS, 'GET /notifications/unread-count': BS, 'PATCH /notifications/:id/read': BS,
  'PATCH /notifications/read-all': BS, 'GET /notifications/stream': BS, 'POST /notifications/register-device': BS,
  'POST /notifications/unregister-device': BS,
  // seller catalogue
  'GET /seller/material-listings': S, 'GET /seller/material-listings/:id': S, 'POST /seller/material-listings': S,
  'PATCH /seller/material-listings/:id': S, 'POST /seller/material-listings/:id/submit': S,
  'PATCH /seller/material-listings/:id/status': S, 'DELETE /seller/material-listings/:id': S,
  'GET /seller/store-profile': S, 'PATCH /seller/store-profile': S, 'GET /seller/dashboard-summary': S,
  // offers
  'POST /offers': B, 'GET /buyer/offers': B, 'GET /seller/offers': S, 'PATCH /offers/:id': BS, 'GET /offers/:id': BS,
  // orders & payments
  'POST /transactions/:id/cancel': B, 'POST /transactions/:id/confirm-receipt': B, 'GET /buyer/transactions': B,
  'POST /transactions/:id/handover': S, 'GET /seller/transactions': S,
  'POST /transactions/:id/dispute': BS, 'GET /transactions/:id': BS,
  'POST /transactions/:id/payment-order': B, 'POST /payments/verify': B, 'POST /transactions/:id/manual-test-payment': B,
  'POST /seller/bank-account': S, 'GET /seller/bank-account': S, 'GET /seller/payout-readiness': S,
  'POST /seller/payouts/:id/retry': S, 'GET /seller/payouts': S,
  // buyer tools
  'POST /saved-listings/toggle': B, 'GET /saved-listings': B,
  'GET /delivery-locations': B, 'POST /delivery-locations': B, 'PATCH /delivery-locations/:id': B,
  'PATCH /delivery-locations/:id/default': B, 'DELETE /delivery-locations/:id': B,
  'POST /requirements': B, 'GET /buyer/requirements': B, 'PATCH /requirements/:id/close': B, 'GET /requirements/:id/responses': B,
  'GET /seller/requirements': S, 'POST /requirements/:id/respond': S,
  'POST /projects': B, 'GET /buyer/projects': B, 'GET /projects/:id': B, 'PATCH /projects/:id': B, 'DELETE /projects/:id': B,
  'POST /sellers/:sellerId/follow': B, 'DELETE /sellers/:sellerId/follow': B,
  // reviews
  'POST /transactions/:id/review': BS, 'PATCH /reviews/:id': BS, 'GET /reviews/mine': BS,
  'GET /sellers/:sellerId/rating-status': B,
};

// ---- expected: admin (/api/admin/v1) — exact rule --------------------------
const ADMIN = {
  'POST /login': 'public', 'PUT /subadmin/passwordset': 'public', 'GET /subadmin/invitation/validate': 'public',
  'POST /forgot-password': 'public', 'GET /reset-password/validate': 'public', 'POST /reset-password': 'public',
  'POST /2fa/login/send-email': 'public', 'POST /2fa/login/verify': 'public', 'POST /2fa/login/recovery': 'public',
  // own account / own notifications (notifications filtered per permission in the service)
  'POST /changePassword': 'signed-in', 'GET /getProfile': 'signed-in', 'POST /updateProfile': 'signed-in', 'POST /logout': 'signed-in',
  'POST /2fa/totp/provision': 'signed-in', 'POST /2fa/totp/verify-setup': 'signed-in', 'POST /2fa/email/initiate': 'signed-in',
  'POST /2fa/email/verify-setup': 'signed-in', 'POST /2fa/acknowledge-recovery': 'signed-in', 'POST /2fa/switch-method': 'signed-in',
  'POST /2fa/recovery/regenerate': 'signed-in', 'GET /2fa/status': 'signed-in', 'POST /2fa/disable/initiate': 'signed-in',
  'POST /2fa/disable/confirm': 'signed-in',
  'GET /notifications': 'signed-in', 'GET /notifications/unread-count': 'signed-in', 'PATCH /notifications/read-all': 'signed-in',
  'PATCH /notifications/:id/read': 'signed-in', 'GET /notifications/stream': 'signed-in',
  // permissioned
  'GET /dashboard/activity-feed': 'all(dashboard:read,audit_log:read)',
  'GET /users': 'all(user:read)', 'GET /users/:id': 'all(user:read)', 'GET /users/:id/listings': 'all(user:read)',
  'GET /users/:id/offers': 'all(user:read)', 'GET /users/:id/transactions': 'all(user:read)', 'GET /users/:id/payments': 'all(user:read)',
  'GET /users/:id/payouts': 'all(user:read)', 'GET /users/:id/reviews': 'all(user:read)', 'GET /users/:id/history': 'all(user:read)',
  'PATCH /users/:id/status': 'all(user:manage)',
  'GET /material-categories': 'all(category:read)', 'POST /material-categories': 'all(category:manage)',
  'PATCH /material-categories/:id': 'all(category:manage)', 'DELETE /material-categories/:id': 'all(category:manage)',
  'GET /business-types': 'all(business_type:read)', 'POST /business-types': 'all(business_type:manage)',
  'PATCH /business-types/:id': 'all(business_type:manage)', 'DELETE /business-types/:id': 'all(business_type:manage)',
  'GET /material-listings/moderation-queue': 'all(listing:read)', 'GET /material-listings': 'all(listing:read)',
  'GET /material-listings/:id': 'all(listing:read)', 'POST /material-listings/:id/decision': 'all(listing:moderate)',
  'PATCH /material-listings/:id/status': 'all(listing:moderate)',
  'GET /reviews': 'all(review:read)', 'GET /reviews/:id': 'all(review:read)', 'PATCH /reviews/:id/moderate': 'all(review:moderate)',
  'GET /transaction-history': 'all(transaction:read)',
  'POST /transaction-history/:id/resolve-dispute': 'all(dispute:resolve)',
  'GET /transactions/:id/payment': 'all(transaction:read)', 'GET /payments/attention': 'all(transaction:read)',
  'POST /transactions/:id/payment-actions': 'any(payment:release,payment:refund,payment:manual_resolve)',
  'GET /payment-history': 'all(payment:read)', 'POST /payments/:id/refund': 'all(payment:refund)',
  'GET /commission-history': 'all(commission:read)', 'GET /commission-settings': 'all(commission:read)',
  'PUT /commission-settings': 'all(commission:update)',
  'GET /settlement-history': 'all(settlement:read)',
  'GET /userconsent/get': 'all(legal_document:read)', 'POST /userconsent/add': 'all(legal_document:manage)',
  'POST /userconsent/update': 'all(legal_document:manage)', 'DELETE /userconsent/delete': 'all(legal_document:manage)',
  'PATCH /userconsent/status': 'all(legal_document:manage)',
  'GET /auditlog/get': 'all(audit_log:read)', 'GET /auditlog/getActionOptions': 'all(audit_log:read)',
  'GET /auditlog/getRoleOptions': 'all(audit_log:read)', 'GET /auditlog/export': 'all(audit_log:read,audit_log:export)',
  'POST /auditlog/bulk-export': 'all(audit_log:read,audit_log:export)', 'GET /auditlog/bulk-export/:jobId': 'all(audit_log:read,audit_log:export)',
  'GET /auditlog/bulk-export/:jobId/download': 'all(audit_log:read,audit_log:export)',
  // Super Admin only (reserved permissions)
  'GET /role/catalog': 'all(role:manage)', 'GET /role/get': 'all(role:manage)', 'POST /role/add': 'all(role:manage)',
  'PUT /role/update': 'all(role:manage)', 'DELETE /role/delete': 'all(role:manage)', 'PATCH /role/status': 'all(role:manage)',
  'POST /subadmin/add': 'all(staff:manage)', 'PUT /subadmin/update': 'all(staff:manage)', 'GET /subadmin/get': 'all(staff:manage)',
  'POST /subadmin/resend': 'all(staff:manage)', 'DELETE /subadmin/delete': 'all(staff:manage)', 'PATCH /subadmin/status': 'all(staff:manage)',
};

describe('RBAC route table — marketplace API', () => {
  const routes = walk(require('../routes/app'));

  test('every route is in the expected table (no unreviewed routes)', () => {
    expect(routes.map((r) => r.key).filter((k) => !(k in APP))).toEqual([]);
    expect(Object.keys(APP).filter((k) => !routes.some((r) => r.key === k))).toEqual([]);
  });

  test.each(Object.entries(APP))('%s → %s', (key, expected) => {
    const r = routes.find((x) => x.key === key);
    expect(r.ordered).toBe(true);
    if (expected === 'public' || expected === 'soft') {
      expect(r.auth).toBe(expected);
      expect(r.rules).toHaveLength(0);
    } else if (expected === 'signed-in') {
      expect(r.auth).toBe('user');
      expect(r.rules).toHaveLength(0);
    } else {
      expect(r.auth).toBe('user');
      expect(rolesAllowed(r.rules)).toBe(expected);
    }
  });

  test('no marketplace route uses an admin permission', () => {
    const userKeys = new Set(Object.values(USER_ROLE_PERMISSIONS).flat());
    routes.flatMap((r) => r.rules).forEach((rule) => rule.permissions.forEach((p) => expect(userKeys.has(p)).toBe(true)));
  });
});

describe('RBAC route table — admin API', () => {
  const routes = walk(require('../routes/admin'));

  test('every route is in the expected table (no unreviewed routes)', () => {
    expect(routes.map((r) => r.key).filter((k) => !(k in ADMIN))).toEqual([]);
    expect(Object.keys(ADMIN).filter((k) => !routes.some((r) => r.key === k))).toEqual([]);
  });

  test.each(Object.entries(ADMIN))('%s → %s', (key, expected) => {
    const r = routes.find((x) => x.key === key);
    expect(r.ordered).toBe(true);
    if (expected === 'public') {
      expect(r.auth).toBe('public');
    } else {
      expect(r.auth).toBe('admin');
      const rule = r.rules.map((x) => `${x.mode}(${x.permissions.join(',')})`).join(' + ');
      expect(rule).toBe(expected === 'signed-in' ? '' : expected);
    }
  });

  test('every admin permission in use is a known admin permission', () => {
    routes.flatMap((r) => r.rules).forEach((rule) => rule.permissions.forEach((p) => expect(ALL_ADMIN_PERMISSIONS).toContain(p)));
  });
});

describe('RBAC catalog invariants', () => {
  test('reserved (Super Admin) permissions can never be put on a staff role', () => {
    RESERVED_ADMIN_PERMISSIONS.forEach((p) => expect(ASSIGNABLE_ADMIN_PERMISSIONS).not.toContain(p));
  });
  test('seller types are not roles: both share the single Seller permission set', () => {
    expect(Object.keys(USER_ROLE_PERMISSIONS).sort()).toEqual(['Buyer', 'Seller']);
  });
  test('no KYC / investor-era permission survives', () => {
    const all = [...ALL_ADMIN_PERMISSIONS, ...Object.values(USER_ROLE_PERMISSIONS).flat()];
    all.forEach((p) => expect(p).not.toMatch(/kyc|investor|developer|compliance|kiis|aml/i));
  });
});
