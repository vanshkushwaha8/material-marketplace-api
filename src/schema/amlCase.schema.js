const mongoose = require('mongoose');

/**
 * OPL-405 — filing a Suspicious Transaction Report with FNTT (the
 * Lithuanian FIU). `immutable` isn't just a display flag — the service
 * layer (strEscalation.service.js#updateFiuStatus) only ever allows
 * fiuReference/fiuStatus to change post-creation; every other field is
 * set once, at case creation, and never touched again. `createdAt` only
 * — deliberately no `updatedAt` (no timestamps:true) — a case that
 * silently shows a different "last modified" time than when the FIU
 * status was actually last updated would undermine the "immutable except
 * for one explicit, audited channel" guarantee this document exists to
 * provide.
 */
const amlCaseSchema = new mongoose.Schema({
  sourceAlertId: { type: mongoose.Schema.Types.ObjectId, ref: 'amlAlerts', required: true },
  subjectType: { type: String, enum: ['investor', 'issuer', 'transaction'], required: true },
  subjectId: { type: String, required: true },

  caseType: { type: String, enum: ['STR'], default: 'STR' },
  immutable: { type: Boolean, default: true },

  consequences: { type: String, required: true },
  confirmedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'admins', required: true },
  confirmedAt: { type: Date, default: Date.now },

  relatedActivityFrozen: { type: Boolean, default: false },
  freezeAppliedAt: { type: Date, default: null },

  fiuReference: { type: String, default: null },
  fiuStatus: { type: String, enum: ['pending_filing', 'filed', 'acknowledged', 'closed'], default: 'pending_filing' },
  fiuStatusUpdatedAt: { type: Date, default: null },
  fiuStatusUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'admins', default: null },

  auditLog: {
    type: [{
      actor: { type: mongoose.Schema.Types.ObjectId, ref: 'admins' },
      action: { type: String },
      timestamp: { type: Date, default: Date.now },
      note: { type: String, default: '' },
    }],
    default: [],
  },

  createdAt: { type: Date, default: Date.now },
});

amlCaseSchema.index({ fiuStatus: 1 });
amlCaseSchema.index({ subjectType: 1, subjectId: 1 });

module.exports = amlCaseSchema;
