const mongoose = require('mongoose');

/**
 * OPL-344 — bulk export of the COMPLETE audit log (not the bounded,
 * synchronous CSV/PDF export already served by auditLog.service.js's
 * exportLogs, which is capped at EXPORT_MAX_ROWS and returns the file
 * directly in the response). At tens of millions of rows, that request/
 * response model doesn't work at all: the process would run out of memory
 * building the file in one buffer, the HTTP request would time out long
 * before a 20-million-row scan finishes, and a second admin requesting an
 * export at the same time would compound the load. This is a job record
 * for the alternative: create job -> return immediately -> a background
 * worker streams the export to disk -> the admin polls status -> downloads
 * once complete. See auditLogBulkExport.service.js for the actual
 * processing logic this record tracks.
 */
const auditLogExportJobSchema = new mongoose.Schema(
  {
    requestedByAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'admins',
      required: true,
      index: true,
    },
    requestIp: { type: String, default: null },

    // Same filter shape auditLog.service.js#buildBaseAggregate already
    // accepts — kept explicit (not Mixed) so a malformed filter object
    // can't silently produce an unfiltered "export everything" job.
    filters: {
      search: { type: String, default: '' },
      action: { type: String, default: '' }, // comma-separated
      category: { type: String, default: '' }, // comma-separated
      role: { type: String, default: '' }, // comma-separated
      startDate: { type: String, default: '' },
      endDate: { type: String, default: '' },
    },

    // CSV only, deliberately — see auditLogBulkExport.service.js's header
    // comment for why PDF is not offered on this path (a paginated
    // print-style document is not a sane deliverable for millions of rows;
    // PDF stays on the existing bounded export instead).
    format: { type: String, enum: ['csv'], default: 'csv' },

    status: {
      type: String,
      enum: ['queued', 'processing', 'completed', 'failed'],
      default: 'queued',
      index: true,
    },

    progress: {
      processedCount: { type: Number, default: 0 },
      // Populated once processing starts — via countDocuments() when
      // filters narrow the result, or the much cheaper
      // estimatedDocumentCount() for a true "export everything" job (see
      // service). It's an estimate, not a guarantee, particularly for the
      // unfiltered case — good enough to drive a progress bar, not
      // something to reconcile row-for-row against the final count.
      estimatedTotal: { type: Number, default: 0 },
    },

    result: {
      filename: { type: String, default: null },
      sizeBytes: { type: Number, default: null },
      rowCount: { type: Number, default: null },
    },

    error: {
      message: { type: String, default: null },
      at: { type: Date, default: null },
    },

    // Every download of a full/large audit-log export is itself logged —
    // this is a more sensitive artifact than the bounded filtered export,
    // so who pulled a copy of it and when is tracked explicitly here in
    // addition to the standard AuditLog entry (see
    // ADMIN_AUDIT_LOG_BULK_EXPORT_DOWNLOADED), not just once.
    downloads: {
      type: [{
        byAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'admins' },
        at: { type: Date, default: Date.now },
        ip: { type: String, default: null },
      }],
      default: [],
    },

    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },

    // Drives file cleanup (see cleanupExpiredExports in
    // auditLogBulkExport.service.js) — the JOB record itself is kept
    // indefinitely as its own audit trail of who exported the full log and
    // when, even after the underlying file is deleted; only the file has
    // an expiry.
    expiresAt: { type: Date, default: null, index: true },
    fileDeletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

auditLogExportJobSchema.index({ requestedByAdminId: 1, createdAt: -1 });
auditLogExportJobSchema.index({ status: 1, createdAt: 1 });

module.exports = auditLogExportJobSchema;
