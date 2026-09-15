const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const auditLogModel = require('../../../model/auditLogs.model');
const auditLogExportJobModel = require('../../../model/auditLogExportJob.model');
const userModel = require('../../../model/user.model');
const adminModel = require('../../../model/admin.model');
const roleModel = require('../../../model/role.model');
const { getCategoryForAction, getActionsForCategory, isHighStakesAction } = require('../../../constants/auditLogCategories');
const { formatActionLabel } = require('../auditLog.service');
const { csvEscape, formatStateChange, toRiskLabel } = require('../../../utils/auditLogExport.util');
const { createAuditLogAdmin } = require('../../../helper/audit.helper');
const auditLogConstants = require('../../../constants/auditLogConstants');
const configenv = require('../../../config/env.config');
const logger = require('../../../logger/error.logger');

class AuditLogBulkExportError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'AuditLogBulkExportError';
    this.statusCode = statusCode;
  }
}



const EXPORT_DIR = path.isAbsolute(configenv.AUDIT_EXPORT_DIR)
  ? configenv.AUDIT_EXPORT_DIR
  : path.join(process.cwd(), configenv.AUDIT_EXPORT_DIR);


function ensureExportDir() {
  if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

const BATCH_SIZE = Number(configenv.AUDIT_EXPORT_BATCH_SIZE) || 2000;
const MAX_CONCURRENT_JOBS = Number(configenv.AUDIT_EXPORT_MAX_CONCURRENT_JOBS) || 1;
const RETENTION_HOURS = Number(configenv.AUDIT_EXPORT_FILE_RETENTION_HOURS) || 48;

const ACTOR_PRELOAD_MAX = Number(configenv.AUDIT_EXPORT_ACTOR_PRELOAD_MAX) || 200000;

const CSV_HEADER = [
  'Timestamp (UTC)', 'User', 'Role', 'Action', 'Action Label', 'Category', 'Entity', 'Entity ID', 'State Change', 'Risk', 'IP Address',
].map(csvEscape).join(',');


async function buildExportQuery(filters = {}) {
  const query = {};
  const { search, action, category, role, startDate, endDate } = filters;

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  let actionFilterList = [];
  if (action) {
    actionFilterList = String(action).split(',').map((a) => a.trim()).filter(Boolean);
  } else if (category) {
    actionFilterList = String(category).split(',').map((c) => c.trim()).filter(Boolean).flatMap(getActionsForCategory);
  }
  if (actionFilterList.length) {
    query.action = { $in: actionFilterList.map((a) => new RegExp(`^${a}$`, 'i')) };
  }

  const trimmedSearch = (search || '').trim();
  if (trimmedSearch) {
    const escaped = trimmedSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    const [matchingUsers, matchingAdmins] = await Promise.all([
      userModel.find({ fullName: regex }).select('_id').limit(10000).lean(),
      adminModel.find({ fullName: regex }).select('_id').limit(10000).lean(),
    ]);
    const or = [{ action: regex }];
    if (matchingUsers.length) or.push({ userId: { $in: matchingUsers.map((u) => u._id) } });
    if (matchingAdmins.length) or.push({ adminId: { $in: matchingAdmins.map((a) => a._id) } });
    query.$or = or;
  }

  if (role) {
  
    const roles = String(role).split(',').map((r) => r.trim().toLowerCase()).filter(Boolean);
    if (roles.some((r) => ['investor', 'issuer', 'developer', 'compliance officer', 'complianceofficer'].includes(r))) {
      query.userId = { $ne: null };
    }
  }

  return query;
}


async function buildActorResolver() {
  const [userCount, adminCount] = await Promise.all([
    userModel.estimatedDocumentCount(),
    adminModel.estimatedDocumentCount(),
  ]);

  const roles = await roleModel.find({}).select('roleName').lean();
  const roleNameById = new Map(roles.map((r) => [String(r._id), r.roleName]));

  if (userCount + adminCount <= ACTOR_PRELOAD_MAX) {
    const [users, admins] = await Promise.all([
      userModel.find({}).select('fullName userType').lean(),
      adminModel.find({}).select('fullName roleId').lean(),
    ]);
    const userMap = new Map(users.map((u) => [String(u._id), { name: u.fullName, role: u.userType }]));
    const adminMap = new Map(
      admins.map((a) => [String(a._id), { name: a.fullName, role: roleNameById.get(String(a.roleId)) || 'Admin' }])
    );
    return { mode: 'preloaded', userMap, adminMap, roleNameById };
  }

  logger.error('Audit export: actor universe exceeds preload cap, falling back to per-batch resolution', {
    userCount, adminCount, cap: ACTOR_PRELOAD_MAX,
  });
  return { mode: 'batch', roleNameById };
}

async function resolveBatchActors(rows, roleNameById) {
  const userIds = [...new Set(rows.filter((r) => r.userId).map((r) => String(r.userId)))];
  const adminIds = [...new Set(rows.filter((r) => r.adminId).map((r) => String(r.adminId)))];
  const [users, admins] = await Promise.all([
    userIds.length ? userModel.find({ _id: { $in: userIds } }).select('fullName userType').lean() : [],
    adminIds.length ? adminModel.find({ _id: { $in: adminIds } }).select('fullName roleId').lean() : [],
  ]);
  const userMap = new Map(users.map((u) => [String(u._id), { name: u.fullName, role: u.userType }]));
  const adminMap = new Map(
    admins.map((a) => [String(a._id), { name: a.fullName, role: roleNameById.get(String(a.roleId)) || 'Admin' }])
  );
  return { userMap, adminMap };
}

function toCsvLine(row, actor) {
  const category = getCategoryForAction(row.action);
  const timestampUTC = row.createdAt ? new Date(row.createdAt).toISOString() : '';
  const ip = (row.ip || '').replace('::ffff:', '');
  return [
    timestampUTC,
    actor?.name || 'Unknown',
    actor?.role || 'N/A',
    row.action || '',
    formatActionLabel(row.action),
    category,
    row.entity || 'N/A',
    row.entityId ? String(row.entityId) : '',
    formatStateChange(row.fromState, row.toState),
    toRiskLabel(isHighStakesAction(row.action)),
    ip,
  ].map(csvEscape).join(',');
}

async function writeBatch(rows, resolver, writeStream) {
  let userMap = resolver.userMap;
  let adminMap = resolver.adminMap;
  if (resolver.mode === 'batch') {
    const resolved = await resolveBatchActors(rows, resolver.roleNameById);
    userMap = resolved.userMap;
    adminMap = resolved.adminMap;
  }
  const lines = rows.map((row) => {
    const actor = row.userId ? userMap.get(String(row.userId)) : row.adminId ? adminMap.get(String(row.adminId)) : null;
    return toCsvLine(row, actor);
  });
  await new Promise((resolve, reject) => {
    writeStream.write(`${lines.join('\r\n')}\r\n`, (err) => (err ? reject(err) : resolve()));
  });
}


async function processExportJob(jobId) {
  const job = await auditLogExportJobModel.findById(jobId);
  if (!job || job.status !== 'queued') return;

  job.status = 'processing';
  job.startedAt = new Date();
  await job.save();

  ensureExportDir();
  const filePath = path.join(EXPORT_DIR, `${job._id}.csv`);
  const writeStream = fs.createWriteStream(filePath);

  try {
    const query = await buildExportQuery(job.filters);
    const hasFilters = Object.values(job.filters?.toObject ? job.filters.toObject() : job.filters || {}).some(Boolean);

    job.progress.estimatedTotal = hasFilters
      ? await auditLogModel.countDocuments(query)
      : await auditLogModel.estimatedDocumentCount();
    await job.save();

    const resolver = await buildActorResolver();

    await new Promise((resolve, reject) => {
      writeStream.write(`${CSV_HEADER}\r\n`, (err) => (err ? reject(err) : resolve()));
    });

    const cursor = auditLogModel
      .find(query)
      .sort({ createdAt: 1 })
      .lean()
      .cursor({ batchSize: BATCH_SIZE });

    let batch = [];
    let processed = 0;
  
    let lastProgressSaveAt = Date.now();
    const PROGRESS_SAVE_INTERVAL_MS = 1000;

    for await (const doc of cursor) {
      batch.push(doc);
      if (batch.length >= BATCH_SIZE) {
        await writeBatch(batch, resolver, writeStream);
        processed += batch.length;
        batch = [];
        if (Date.now() - lastProgressSaveAt >= PROGRESS_SAVE_INTERVAL_MS) {
          job.progress.processedCount = processed;
          await job.save();
          lastProgressSaveAt = Date.now();
        }
      }
    }
    if (batch.length) {
      await writeBatch(batch, resolver, writeStream);
      processed += batch.length;
    }

    await new Promise((resolve, reject) => {
      writeStream.end((err) => (err ? reject(err) : resolve()));
    });

    const stats = await fs.promises.stat(filePath);
    job.status = 'completed';
    job.progress.processedCount = processed;
    job.result = { filename: `${job._id}.csv`, sizeBytes: stats.size, rowCount: processed };
    job.completedAt = new Date();
    job.expiresAt = new Date(Date.now() + RETENTION_HOURS * 60 * 60 * 1000);
    await job.save();
  } catch (err) {
    logger.error('Audit log bulk export failed', { jobId: String(jobId), message: err.message, stack: err.stack });
    job.status = 'failed';
    job.error = { message: err.message, at: new Date() };
    await job.save();
    writeStream.destroy();
    fs.promises.unlink(filePath).catch(() => {});
  }
}


async function createExportJob({ filters, adminId, req }) {
  const activeCount = await auditLogExportJobModel.countDocuments({ status: { $in: ['queued', 'processing'] } });
  if (activeCount >= MAX_CONCURRENT_JOBS) {
    throw new AuditLogBulkExportError(
      `${activeCount} audit log export(s) already running platform-wide (limit: ${MAX_CONCURRENT_JOBS}). Please wait for the current export to finish before starting another.`,
      409
    );
  }
  const ownActiveJob = await auditLogExportJobModel.findOne({
    requestedByAdminId: adminId,
    status: { $in: ['queued', 'processing'] },
  });
  if (ownActiveJob) {
    throw new AuditLogBulkExportError('You already have an audit log export in progress.', 409);
  }

  const job = await auditLogExportJobModel.create({
    requestedByAdminId: adminId,
    requestIp: req?.ip ?? null,
    filters: filters || {},
  });

await createAuditLogAdmin({
    req,
    adminId,
    userRole: 'admin',
    action: auditLogConstants.ADMIN_AUDIT_LOG_BULK_EXPORT_REQUESTED,
    entity: 'AuditLogExportJob',
    entityId: job._id,
    reason: Object.values(filters || {}).some(Boolean) ? `Filtered export: ${JSON.stringify(filters)}` : 'Full, unfiltered export',
  });

  setImmediate(() => {
    processExportJob(job._id).catch((err) => {
      logger.error('Unhandled error starting audit export job', { jobId: String(job._id), message: err.message });
    });
  });

  return job;
}


function computeProgressEstimate(job) {
  const processedCount = job.progress?.processedCount || 0;
  const estimatedTotal = job.progress?.estimatedTotal || 0;

  if (job.status === 'completed') {
    const elapsedSeconds = job.startedAt && job.completedAt
      ? Math.round((new Date(job.completedAt) - new Date(job.startedAt)) / 1000)
      : null;
    return { progressPercent: 100, elapsedSeconds, estimatedSecondsRemaining: 0 };
  }

  if (job.status !== 'processing' || !job.startedAt || processedCount === 0 || estimatedTotal === 0) {
    return { progressPercent: 0, elapsedSeconds: null, estimatedSecondsRemaining: null };
  }

  const elapsedMs = Date.now() - new Date(job.startedAt).getTime();
  const rowsPerMs = processedCount / elapsedMs;
  const remainingRows = Math.max(0, estimatedTotal - processedCount);
  const estimatedRemainingMs = rowsPerMs > 0 ? remainingRows / rowsPerMs : null;

  return {
    progressPercent: Math.min(100, Math.round((processedCount / estimatedTotal) * 100)),
    elapsedSeconds: Math.round(elapsedMs / 1000),
    estimatedSecondsRemaining: estimatedRemainingMs != null ? Math.round(estimatedRemainingMs / 1000) : null,
  };
}

async function getJobStatus(jobId, auth) {
  if (!mongoose.Types.ObjectId.isValid(jobId)) {
    throw new AuditLogBulkExportError('Invalid export job id');
  }
  const job = await auditLogExportJobModel.findById(jobId);
  if (!job) throw new AuditLogBulkExportError('Export job not found', 404);

  const isFullAccess = auth?.isSuperAdmin === true || auth?.type === 'admin';
  if (!isFullAccess && String(job.requestedByAdminId) !== String(auth?._id)) {
    throw new AuditLogBulkExportError('You do not have access to this export job', 403);
  }
  return job;
}

async function streamDownload(jobId, auth, req, response) {
  const job = await getJobStatus(jobId, auth); 
  if (job.status !== 'completed') {
    throw new AuditLogBulkExportError(`This export is not ready yet (status: ${job.status}).`, 409);
  }
  if (job.fileDeletedAt) {
    throw new AuditLogBulkExportError('This export has expired and its file has been removed. Please request a new export.', 410);
  }
  const filePath = path.join(EXPORT_DIR, job.result.filename);
  if (!fs.existsSync(filePath)) {
    throw new AuditLogBulkExportError('The export file could not be found on the server.', 404);
  }

job.downloads.push({ byAdminId: auth._id, at: new Date(), ip: req?.ip ?? null });
  await job.save();
  await createAuditLogAdmin({
    req,
    adminId: auth._id,
    userRole: 'admin',
    action: auditLogConstants.ADMIN_AUDIT_LOG_BULK_EXPORT_DOWNLOADED,
    entity: 'AuditLogExportJob',
    entityId: job._id,
    reason: `Downloaded ${job.result.rowCount} row(s)`,
  });

  response.setHeader('Content-Type', 'text/csv; charset=utf-8');
  response.setHeader('Content-Disposition', `attachment; filename="audit-log-full-export-${job._id}.csv"`);
  response.setHeader('Content-Length', job.result.sizeBytes);

  fs.createReadStream(filePath).pipe(response);
}

async function cleanupExpiredExports() {
  const expiredJobs = await auditLogExportJobModel.find({
    status: 'completed',
    fileDeletedAt: null,
    expiresAt: { $lte: new Date() },
  });
  for (const job of expiredJobs) {
    const filePath = path.join(EXPORT_DIR, job.result?.filename || `${job._id}.csv`);
    await fs.promises.unlink(filePath).catch(() => {}); 
    job.fileDeletedAt = new Date();
    await job.save();
  }
  return expiredJobs.length;
}

module.exports = {
  AuditLogBulkExportError,
  createExportJob,
  getJobStatus,
  computeProgressEstimate,
  streamDownload,
  processExportJob,
  cleanupExpiredExports,
};
