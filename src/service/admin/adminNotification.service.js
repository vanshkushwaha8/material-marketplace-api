const mongoose = require('mongoose');
const { EventEmitter } = require('events');
const adminNotificationModel = require('../../model/adminNotification.model');
const roleModel = require('../../model/role.model');
const permissionModel = require('../../model/permission.model');
const deleteConstants = require('../../constants/delete.constants');
const statusConstants = require('../../constants/status.constants');
const { ADMIN_NOTIFICATION_TYPES, ADMIN_NOTIFICATION_CATEGORIES, ADMIN_NOTIFICATION_SEVERITY } = require('../../constants/adminNotification.constants');

// In-process fan-out to connected admin SSE streams (same single-instance
// caveat as the buyer/seller notification emitter — move to Redis pub/sub
// when running several API instances).
const adminNotificationEmitter = new EventEmitter();
adminNotificationEmitter.setMaxListeners(0);
const ADMIN_EVENT = 'admin-notification';

/**
 * The ONE entry point business code calls. Never throws and never blocks
 * the business action that triggered it — an alerting failure must not
 * fail a payment webhook or a dispute.
 *
 * @param {string} type - key of ADMIN_NOTIFICATION_TYPES
 * @param {{title, message, entityType?, entityId?, entityName?, userId?, metadata?, dedupeKey?, severity?}} data
 */
async function notifyAdmins(type, data) {
  try {
    const def = ADMIN_NOTIFICATION_TYPES[type];
    if (!def) throw new Error(`Unknown admin notification type ${type}`);
    const doc = await adminNotificationModel.create({
      type,
      category: def.category,
      severity: data.severity || def.severity,
      title: data.title,
      message: data.message,
      link: def.link(data),
      requiredPermission: def.permission,
      entityType: data.entityType || null,
      entityId: data.entityId && mongoose.Types.ObjectId.isValid(data.entityId) ? data.entityId : null,
      entityName: data.entityName || null,
      userId: data.userId && mongoose.Types.ObjectId.isValid(data.userId) ? data.userId : null,
      metadata: data.metadata || {},
      dedupeKey: data.dedupeKey || undefined,
    });
    adminNotificationEmitter.emit(ADMIN_EVENT, doc.toObject());
    return doc;
  } catch (err) {
    if (err?.code === 11000) return null; // deduplicated repeat — expected
    console.error('[ADMIN NOTIFICATION] failed (non-fatal):', type, err.message);
    return null;
  }
}

// Which notifications this admin may see: everything for super-admins,
// otherwise exactly the permissions on their active role (same resolution
// as permission.middleware.js).
async function getVisibility(admin) {
  if (admin?.isSuperAdmin === true || admin?.type === 'admin') return { all: true, permissions: null };
  const role = admin?.roleId
    ? await roleModel.findOne({ _id: admin.roleId, is_deleted: deleteConstants.NOT_DELETED, status: statusConstants.active }).select('permissionIds').lean()
    : null;
  if (!role) return { all: false, permissions: [] };
  const perms = await permissionModel.find({ _id: { $in: role.permissionIds || [] }, is_deleted: deleteConstants.NOT_DELETED, status: statusConstants.active })
    .select('modulePermission').lean();
  return { all: false, permissions: perms.map((p) => p.modulePermission) };
}

function visibilityFilter(visibility) {
  return visibility.all ? {} : { requiredPermission: { $in: visibility.permissions } };
}

function canSee(visibility, notification) {
  return visibility.all || visibility.permissions.includes(notification.requiredPermission);
}

function present(doc, adminId) {
  const { readBy, requiredPermission, dedupeKey, ...rest } = doc;
  return { ...rest, isRead: (readBy || []).some((id) => String(id) === String(adminId)) };
}

async function list({ admin, page = 1, limit = 20, unreadOnly = false, severity, category }) {
  const visibility = await getVisibility(admin);
  const query = visibilityFilter(visibility);
  if (unreadOnly) query.readBy = { $ne: admin._id };
  if (severity && Object.values(ADMIN_NOTIFICATION_SEVERITY).includes(severity)) query.severity = severity;
  if (category && ADMIN_NOTIFICATION_CATEGORIES.includes(category)) query.category = category;
  const pageNum = Math.max(1, Number(page) || 1);
  const pageLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const [rows, count] = await Promise.all([
    adminNotificationModel.find(query).sort({ createdAt: -1 }).skip((pageNum - 1) * pageLimit).limit(pageLimit).lean(),
    adminNotificationModel.countDocuments(query),
  ]);
  return { getData: rows.map((r) => present(r, admin._id)), count, page: pageNum, limit: pageLimit };
}

async function unreadCounts(admin) {
  const visibility = await getVisibility(admin);
  const rows = await adminNotificationModel.aggregate([
    { $match: { ...visibilityFilter(visibility), readBy: { $ne: new mongoose.Types.ObjectId(String(admin._id)) } } },
    { $group: { _id: '$severity', n: { $sum: 1 } } },
  ]);
  const bySeverity = rows.reduce((acc, r) => ({ ...acc, [r._id]: r.n }), {});
  return { total: rows.reduce((s, r) => s + r.n, 0), bySeverity };
}

async function markRead({ admin, notificationId }) {
  if (!mongoose.Types.ObjectId.isValid(notificationId)) return null;
  const visibility = await getVisibility(admin);
  return adminNotificationModel.findOneAndUpdate(
    { _id: notificationId, ...visibilityFilter(visibility) },
    { $addToSet: { readBy: admin._id } },
    { new: true }
  ).lean();
}

async function markAllRead(admin) {
  const visibility = await getVisibility(admin);
  const result = await adminNotificationModel.updateMany(
    { ...visibilityFilter(visibility), readBy: { $ne: admin._id } },
    { $addToSet: { readBy: admin._id } }
  );
  return { modified: result.modifiedCount };
}

module.exports = {
  notifyAdmins, list, unreadCounts, markRead, markAllRead,
  getVisibility, canSee, present, adminNotificationEmitter, ADMIN_EVENT,
};
