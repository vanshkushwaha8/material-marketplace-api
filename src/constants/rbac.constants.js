// Single source of truth for authorization (RBAC).
//
//   Principal (authenticated)
//     → Role          users.userType (Buyer | Seller)
//                     admins: Super Admin, or a staff role from `roles`
//     → Permissions   fixed per marketplace role (below); for staff, the
//                     keys stored on their role (roles.permissions)
//     → Ownership     enforced in the services (a seller only touches their
//                     own listings, a buyer only their own orders, …)
//
// Marketplace users and admins are separate authentication realms (separate
// collections, cookies, middleware), so each realm has its own permission
// catalog and a key from one realm can never authorize the other.
//
// sellerType (INDIVIDUAL | BUSINESS_STORE) is NOT a role: both seller types
// hold the same Seller permissions; the type only changes business rules
// (store profile, listing fields, commission rate).

const ROLES = Object.freeze({
  BUYER: 'Buyer',
  SELLER: 'Seller',
  SUPER_ADMIN: 'SUPER_ADMIN',
});

// ---------------------------------------------------------------------------
// Marketplace (buyer / seller) permissions — granted by role, not editable.
// ---------------------------------------------------------------------------
const USER_PERMISSIONS = Object.freeze({
  ACCOUNT_MANAGE: 'account:manage',                 // own profile, password, sessions, 2FA
  NOTIFICATION_READ: 'notification:read',           // own notifications + push devices

  LISTING_MANAGE: 'listing:manage',                 // create/edit/delete OWN listings
  STORE_MANAGE: 'store:manage',                     // OWN store profile
  SELLER_DASHBOARD_READ: 'seller_dashboard:read',

  OFFER_CREATE: 'offer:create',                     // make offers; list offers made
  OFFER_RECEIVE: 'offer:receive',                   // list offers on own listings
  OFFER_RESPOND: 'offer:respond',                   // view/act on an offer you are a party to

  ORDER_READ: 'order:read',                         // view an order you are a party to
  ORDER_PURCHASE: 'order:purchase',                 // buyer side: list, cancel, confirm receipt
  ORDER_FULFIL: 'order:fulfil',                     // seller side: list, mark handover
  ORDER_DISPUTE: 'order:dispute',
  PAYMENT_CREATE: 'payment:create',                 // pay for own order
  PAYOUT_MANAGE: 'payout:manage',                   // own bank account + payouts

  REVIEW_MANAGE: 'review:manage',                   // rate the other party; own reviews
  REQUIREMENT_POST: 'requirement:post',
  REQUIREMENT_RESPOND: 'requirement:respond',
  PROJECT_MANAGE: 'project:manage',
  DELIVERY_LOCATION_MANAGE: 'delivery_location:manage',
  SAVED_LISTING_MANAGE: 'saved_listing:manage',
  SELLER_FOLLOW: 'seller:follow',
});

const U = USER_PERMISSIONS;
const USER_ROLE_PERMISSIONS = Object.freeze({
  [ROLES.BUYER]: Object.freeze([
    U.ACCOUNT_MANAGE, U.NOTIFICATION_READ,
    U.OFFER_CREATE, U.OFFER_RESPOND,
    U.ORDER_READ, U.ORDER_PURCHASE, U.ORDER_DISPUTE, U.PAYMENT_CREATE,
    U.REVIEW_MANAGE, U.REQUIREMENT_POST, U.PROJECT_MANAGE,
    U.DELIVERY_LOCATION_MANAGE, U.SAVED_LISTING_MANAGE, U.SELLER_FOLLOW,
  ]),
  [ROLES.SELLER]: Object.freeze([
    U.ACCOUNT_MANAGE, U.NOTIFICATION_READ,
    U.LISTING_MANAGE, U.STORE_MANAGE, U.SELLER_DASHBOARD_READ,
    U.OFFER_RECEIVE, U.OFFER_RESPOND,
    U.ORDER_READ, U.ORDER_FULFIL, U.ORDER_DISPUTE, U.PAYOUT_MANAGE,
    U.REVIEW_MANAGE, U.REQUIREMENT_RESPOND,
  ]),
});

// ---------------------------------------------------------------------------
// Admin permissions. The Super Admin holds all of them. Staff hold only what
// their role lists; RESERVED keys can never be put on a staff role.
// ---------------------------------------------------------------------------
const ADMIN_PERMISSIONS = Object.freeze({
  DASHBOARD_READ: 'dashboard:read',
  USER_READ: 'user:read',
  USER_MANAGE: 'user:manage',
  CATEGORY_READ: 'category:read',
  CATEGORY_MANAGE: 'category:manage',
  BUSINESS_TYPE_READ: 'business_type:read',
  BUSINESS_TYPE_MANAGE: 'business_type:manage',
  LISTING_READ: 'listing:read',
  LISTING_MODERATE: 'listing:moderate',
  REVIEW_READ: 'review:read',
  REVIEW_MODERATE: 'review:moderate',
  TRANSACTION_READ: 'transaction:read',
  DISPUTE_RESOLVE: 'dispute:resolve',
  PAYMENT_READ: 'payment:read',
  PAYMENT_RELEASE: 'payment:release',
  PAYMENT_REFUND: 'payment:refund',
  PAYMENT_MANUAL_RESOLVE: 'payment:manual_resolve',
  COMMISSION_READ: 'commission:read',
  COMMISSION_UPDATE: 'commission:update',
  SETTLEMENT_READ: 'settlement:read',
  LEGAL_DOCUMENT_READ: 'legal_document:read',
  LEGAL_DOCUMENT_MANAGE: 'legal_document:manage',
  AUDIT_LOG_READ: 'audit_log:read',
  AUDIT_LOG_EXPORT: 'audit_log:export',
  // Reserved — Super Admin only (prevents staff granting themselves access).
  STAFF_MANAGE: 'staff:manage',
  ROLE_MANAGE: 'role:manage',
});

const A = ADMIN_PERMISSIONS;
const RESERVED_ADMIN_PERMISSIONS = Object.freeze([A.STAFF_MANAGE, A.ROLE_MANAGE]);

// What the role editor offers, grouped by module (labels are UI copy).
const ADMIN_PERMISSION_CATALOG = Object.freeze([
  { module: 'Dashboard', permissions: [{ key: A.DASHBOARD_READ, label: 'View dashboard & activity feed' }] },
  { module: 'Users', permissions: [
    { key: A.USER_READ, label: 'View buyers & sellers' },
    { key: A.USER_MANAGE, label: 'Suspend / reactivate users' },
  ] },
  { module: 'Material categories', permissions: [
    { key: A.CATEGORY_READ, label: 'View categories' },
    { key: A.CATEGORY_MANAGE, label: 'Create, edit & delete categories' },
  ] },
  { module: 'Business types', permissions: [
    { key: A.BUSINESS_TYPE_READ, label: 'View business types' },
    { key: A.BUSINESS_TYPE_MANAGE, label: 'Create, edit & delete business types' },
  ] },
  { module: 'Material listings', permissions: [
    { key: A.LISTING_READ, label: 'View listings & moderation queue' },
    { key: A.LISTING_MODERATE, label: 'Approve, reject & change listing status' },
  ] },
  { module: 'Ratings', permissions: [
    { key: A.REVIEW_READ, label: 'View ratings' },
    { key: A.REVIEW_MODERATE, label: 'Hide / restore ratings' },
  ] },
  { module: 'Orders', permissions: [
    { key: A.TRANSACTION_READ, label: 'View transactions & payment detail' },
    { key: A.DISPUTE_RESOLVE, label: 'Resolve disputes (release or refund)' },
  ] },
  { module: 'Payments', permissions: [
    { key: A.PAYMENT_READ, label: 'View payment history' },
    { key: A.PAYMENT_RELEASE, label: 'Approve / retry release to seller' },
    { key: A.PAYMENT_REFUND, label: 'Refund buyers / retry refunds' },
    { key: A.PAYMENT_MANUAL_RESOLVE, label: 'Manual release / refund with external reference' },
  ] },
  { module: 'Commission', permissions: [
    { key: A.COMMISSION_READ, label: 'View commission settings & history' },
    { key: A.COMMISSION_UPDATE, label: 'Change commission rates' },
  ] },
  { module: 'Settlements', permissions: [{ key: A.SETTLEMENT_READ, label: 'View seller settlements & payouts' }] },
  { module: 'Legal documents', permissions: [
    { key: A.LEGAL_DOCUMENT_READ, label: 'View legal documents' },
    { key: A.LEGAL_DOCUMENT_MANAGE, label: 'Create, edit, publish & delete legal documents' },
  ] },
  { module: 'Audit log', permissions: [
    { key: A.AUDIT_LOG_READ, label: 'View audit log' },
    { key: A.AUDIT_LOG_EXPORT, label: 'Export audit log' },
  ] },
]);

const ASSIGNABLE_ADMIN_PERMISSIONS = Object.freeze(
  ADMIN_PERMISSION_CATALOG.flatMap((group) => group.permissions.map((p) => p.key))
);

const ALL_USER_PERMISSIONS = Object.freeze(Object.values(USER_PERMISSIONS));
const ALL_ADMIN_PERMISSIONS = Object.freeze(Object.values(ADMIN_PERMISSIONS));

module.exports = {
  ROLES,
  USER_PERMISSIONS,
  USER_ROLE_PERMISSIONS,
  ADMIN_PERMISSIONS,
  RESERVED_ADMIN_PERMISSIONS,
  ADMIN_PERMISSION_CATALOG,
  ASSIGNABLE_ADMIN_PERMISSIONS,
  ALL_USER_PERMISSIONS,
  ALL_ADMIN_PERMISSIONS,
};
