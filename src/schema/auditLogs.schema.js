const mongoose = require("mongoose");
const auditLogConstants = require("../constants/auditLogConstants")
const auditLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "users",
  },
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "admins",
  },
  action: {
    type: String,
    enum: Object.values(auditLogConstants),
    required: true
  },
  entity: {
    type: String,
    required: true
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: "entity"
  },
  fromState: { type: String, },
  toState: { type: String,},
  reason: { type: String,  },
  affectedField: { type: String, },
  defectDescription: { type: String,  },
  requestId: { type: mongoose.Schema.Types.ObjectId },
  ip: {
    type: String,
  },
  userAgent: {
    type: String,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  jurisdiction: {
    type: String,
  }
}, { timestamps: true });

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ adminId: 1, createdAt: -1 });
auditLogSchema.index({ entity: 1, entityId: 1 });

const AUDIT_IMMUTABLE_ERROR = 'Audit log entries are append-only and cannot be modified or deleted.';
auditLogSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace'], function (next) {
  next(new Error(AUDIT_IMMUTABLE_ERROR));
});
auditLogSchema.pre(['deleteOne', 'deleteMany', 'findOneAndDelete'], function (next) {
  next(new Error(AUDIT_IMMUTABLE_ERROR));
});
auditLogSchema.pre('save', function (next) {
  if (!this.isNew) {
    return next(new Error(AUDIT_IMMUTABLE_ERROR));
  }
  next();
});

module.exports = auditLogSchema