const PERMISSIONS = require('./permission.constant');

const ADMIN_NOTIFICATION_SEVERITY = Object.freeze({ INFO: 'info', WARNING: 'warning', CRITICAL: 'critical' });

// Only events an operator has to ACT on (or must know about to protect
// money/users) — never a mirror of buyer/seller activity.
//
// Each type carries its defaults: who may see it (RBAC permission — a
// sub-admin without it never sees the notification; super-admins see all),
// how urgent it is, and which admin screen resolves it.
const ADMIN_NOTIFICATION_TYPES = Object.freeze({
  // Moderation
  LISTING_PENDING_REVIEW: { category: 'moderation', severity: 'info', permission: PERMISSIONS.MATERIALLISTING.MATERIAL_LISTING_VIEW, link: () => '/admin/material-listings/moderation' },
  STORE_REGISTERED: { category: 'users', severity: 'info', permission: PERMISSIONS.USERMANAGEMENT.USER_VIEW, link: (n) => (n.userId ? `/admin/users/${n.userId}` : '/admin/users') },
  // Disputes
  TRANSACTION_DISPUTED: { category: 'disputes', severity: 'critical', permission: PERMISSIONS.TRANSACTIONHISTORY.DISPUTE_MANAGE, link: (n) => (n.entityId ? `/admin/transaction-history?open=${n.entityId}` : '/admin/transaction-history') },
  // Money in
  PAYMENT_RECONCILIATION_REQUIRED: { category: 'payments', severity: 'critical', permission: PERMISSIONS.TRANSACTIONHISTORY.REFUND_MANAGE, link: () => '/admin/payment-history' },
  REFUND_PROCESSED: { category: 'payments', severity: 'info', permission: PERMISSIONS.TRANSACTIONHISTORY.PAYMENT_HISTORY_VIEW, link: (n) => (n.entityType === 'transaction' && n.entityId ? `/admin/transaction-history?open=${n.entityId}` : '/admin/payment-history') },
  REFUND_FAILED: { category: 'payments', severity: 'critical', permission: PERMISSIONS.TRANSACTIONHISTORY.REFUND_MANAGE, link: (n) => (n.entityId ? `/admin/transaction-history?open=${n.entityId}` : '/admin/transaction-history') },
  // A release/refund could not complete automatically — the escrow is in
  // REQUIRES_ADMIN_ACTION / REFUND_FAILED and needs an admin retry/resolution.
  ESCROW_ACTION_REQUIRED: { category: 'payments', severity: 'critical', permission: PERMISSIONS.PAYMENTCONTROL.ESCROW_ACTION, link: (n) => (n.entityId ? `/admin/transaction-history?open=${n.entityId}` : '/admin/transaction-history') },
  HIGH_VALUE_DEAL: { category: 'payments', severity: 'info', permission: PERMISSIONS.TRANSACTIONHISTORY.TRANSACTION_HISTORY_VIEW, link: () => '/admin/transaction-history' },
  // Money out
  PAYOUT_FAILED: { category: 'payouts', severity: 'warning', permission: PERMISSIONS.TRANSACTIONHISTORY.SETTLEMENT_HISTORY_VIEW, link: () => '/admin/settlement-history' },
  PAYOUT_HELD: { category: 'payouts', severity: 'warning', permission: PERMISSIONS.TRANSACTIONHISTORY.SETTLEMENT_HISTORY_VIEW, link: () => '/admin/settlement-history' },
  // Platform / security
  PAYOUTS_NOT_CONFIGURED: { category: 'system', severity: 'critical', permission: PERMISSIONS.TRANSACTIONHISTORY.SETTLEMENT_HISTORY_VIEW, link: () => '/admin/settlement-history' },
  WEBHOOK_SIGNATURE_INVALID: { category: 'security', severity: 'critical', permission: PERMISSIONS.TRANSACTIONHISTORY.PAYMENT_HISTORY_VIEW, link: () => '/admin/payment-history' },
});

const ADMIN_NOTIFICATION_CATEGORIES = ['moderation', 'users', 'disputes', 'payments', 'payouts', 'system', 'security'];

module.exports = { ADMIN_NOTIFICATION_TYPES, ADMIN_NOTIFICATION_SEVERITY, ADMIN_NOTIFICATION_CATEGORIES };
