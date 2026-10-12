const userModel = require('../../model/user.model');
const { SAFETY_NOTICE_VERSIONS, SAFETY_NOTICE_ACTIONS } = require('../../constants/safetyNotice.constants');
const { createAuditLog } = require('../../helper/audit.helper');
const auditLogConstants = require('../../constants/auditLogConstants');

class SafetyNoticeError extends Error {
  constructor(message, statusCode = 400) { super(message); this.name = 'SafetyNoticeError'; this.statusCode = statusCode; }
}

// The account's own role decides which notice applies — never a client
// parameter (users.userType is 'Buyer' | 'Seller').
const roleOf = (user) => (String(user?.userType || '').toLowerCase() === 'seller' ? 'seller' : 'buyer');

/** Whether the post-login notice should be shown to this user right now. */
async function getStatus(userId) {
  const user = await userModel.findById(userId).select('userType safetyNoticeAcks').lean();
  if (!user) throw new SafetyNoticeError('User not found', 404);
  const role = roleOf(user);
  const currentVersion = SAFETY_NOTICE_VERSIONS[role];
  const record = (user.safetyNoticeAcks || []).find((a) => a.role === role && a.version === currentVersion) || null;
  return {
    role,
    currentVersion,
    shouldShow: !record,
    lastAction: record ? { action: record.action, at: record.at } : null,
  };
}

/**
 * Record that the user acknowledged (or dismissed) the CURRENT notice for
 * their role. Idempotent per role+version. A stale version (the notice
 * changed while the modal was open) is refused so the user sees the new one.
 */
async function record({ userId, version, action, req }) {
  if (!Object.values(SAFETY_NOTICE_ACTIONS).includes(action)) throw new SafetyNoticeError('Unknown action');
  const user = await userModel.findById(userId).select('userType').lean();
  if (!user) throw new SafetyNoticeError('User not found', 404);
  const role = roleOf(user);
  const currentVersion = SAFETY_NOTICE_VERSIONS[role];
  if (version !== currentVersion) throw new SafetyNoticeError('The safety notice has been updated — please review the latest version', 409);

  const now = new Date();
  // Only the first record per role+version is kept (conditional push).
  const res = await userModel.updateOne(
    { _id: userId, safetyNoticeAcks: { $not: { $elemMatch: { role, version: currentVersion } } } },
    { $push: { safetyNoticeAcks: { role, version: currentVersion, action, at: now } } }
  );
  if (res.modifiedCount) {
    await createAuditLog({
      req, userId, action: auditLogConstants.SAFETY_NOTICE_ACKNOWLEDGED, entity: 'users', entityId: userId,
      metadata: { role, version: currentVersion, action },
    });
  }
  return getStatus(userId);
}

module.exports = { SafetyNoticeError, getStatus, record };
