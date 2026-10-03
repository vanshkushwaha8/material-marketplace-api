const auditLogConstants = require("./auditLogConstants");

// Audit-log categories for the construction-materials marketplace. Every
// action is classified by rule (ordered — first match wins) instead of a
// hand-maintained map, so new actions land in a sensible category without
// edits here. Used by the audit-log category filter, CSV/PDF export and the
// bulk export (auditLog.service.js / auditLogBulkExport.service.js).
const AUDIT_CATEGORIES = Object.freeze({
  ACCESS: "Access",
  USERS: "Users",
  LISTINGS: "Listings",
  ORDERS: "Orders",
  PAYMENTS: "Payments",
  REVIEWS: "Reviews",
  CATALOG: "Catalog",
  ADMIN: "Admin & roles",
  GENERAL: "General",
});

const C = AUDIT_CATEGORIES;
const RULES = [
  // Legal-document and audit-export admin actions (before Access: they
  // contain CONSENT / EXPORT but are console configuration).
  [C.ADMIN, /USERCONSENT|AUDIT_LOG/],
  // Access control decisions first (ROLE_ACCESS_DENIED is access, not role admin).
  [C.ACCESS, /ACCESS_DENIED|PERMISSION_DENIED|LOGIN|LOGOUT|PASSWORD|SESSION|TWOFA|2FA|OTP|REGISTER|VERIF|CONSENT|EMAIL_NOT_VERIFIED/],
  [C.PAYMENTS, /PAYMENT|REFUND|ESCROW|COMMISSION|PAYOUT|SETTLEMENT|BANK_ACCOUNT/],
  [C.ORDERS, /OFFER|TRANSACTION|HANDOVER|RESERVATION|DISPUTE|INVENTORY|REQUIREMENT|PROJECT/],
  [C.LISTINGS, /LISTING|STORE_PROFILE/],
  [C.REVIEWS, /REVIEW|RATING/],
  [C.CATALOG, /CATEGORY|BUSINESS_TYPE/],
  [C.ADMIN, /ROLE|SUBADMIN|USERCONSENT|AUDIT_LOG/],
  [C.USERS, /USER|PROFILE|ACOUNTDELETE|ACCOUNT|LOCATION|FOLLOW|DELIVERY/],
];

// Money movement, access-control configuration, account removal and data
// leaving the platform.
const HIGH_STAKES_PATTERN = /ADMIN_ESCROW_ACTION|REFUND_(INITIATED|COMPLETED)|PAYOUT_PAID|ADMIN_COMMISSION_UPDATED|^ROLE(CREATED|UPDATED|DELETED|STATUSCHANGED)$|^SUBADMIN(CREATED|DELETED|STATUSCHANGED|_UPDATED)$|ADMIN_USER_(SUSPENDED|REACTIVATED)|ACOUNTDELETE|BULK_EXPORT|TRANSACTION_DISPUTED|MATERIAL_LISTING_STATUS_CHANGED|TWOFA_DISABLED/;

const ALL_ACTIONS = [...new Set(Object.values(auditLogConstants))];

const getCategoryForAction = (action) => {
  if (!action) return C.GENERAL;
  const name = String(action).toUpperCase();
  const rule = RULES.find(([, pattern]) => pattern.test(name));
  return rule ? rule[0] : C.GENERAL;
};

const getActionsForCategory = (category) => {
  if (!category) return [];
  const wanted = String(category).trim().toLowerCase();
  return ALL_ACTIONS.filter((action) => getCategoryForAction(action).toLowerCase() === wanted);
};

const isHighStakesAction = (action) => !!action && HIGH_STAKES_PATTERN.test(String(action).toUpperCase());

const ACTION_CATEGORY_MAP = Object.freeze(Object.fromEntries(ALL_ACTIONS.map((a) => [a, getCategoryForAction(a)])));
const HIGH_STAKES_ACTIONS = new Set(ALL_ACTIONS.filter(isHighStakesAction));

module.exports = {
  AUDIT_CATEGORIES,
  ACTION_CATEGORY_MAP,
  HIGH_STAKES_ACTIONS,
  getCategoryForAction,
  getActionsForCategory,
  isHighStakesAction,
};
