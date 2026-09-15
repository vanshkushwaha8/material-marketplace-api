const AuditLog = require('../model/auditLogs.model');
const adminModel = require('../model/admin.model');
const roleModel = require('../model/role.model');
const ADMIN_ROLES = require('../constants/adminRoles.constants');
const createAuditLog = ({
  req,
  userId,
  action,
  entity,
  entityId,
  fromState,
  toState,
  reason ,
  affectedField,
  defectDescription,
  metadata = {},
}) => {
  return AuditLog.create({
    userId,
    action,
    entity,
    entityId,
    fromState,
    toState,
    reason,
    affectedField,
    defectDescription,
    ip: req?.ip ?? null,
    userAgent: req?.headers?.['user-agent'] ?? null,
    metadata,
  }).catch((err) => {
    console.error('Audit log failed:', err.message, '| Action:', action);
  });
};
const createAuditLogAdmin = ({
  req,
  adminId,
  action,
  entity,
  entityId,
  fromState,
  toState,
  reason,
  affectedField,
  metadata = {},
}) => {
    AuditLog.create({
      adminId,
      action,
      entity,
      entityId,
      fromState,
      toState,
      reason,
      affectedField,
      ip: req?.ip ?? null,
      userAgent: req?.headers?.['user-agent'] ?? null,
      metadata,
    })
};

module.exports = { createAuditLog, createAuditLogAdmin };