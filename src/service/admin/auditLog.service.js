const helper = require('../../helper/helper');
const auditLogModel = require('../../model/auditLogs.model');
const auditLogConstants = require('../../constants/auditLogConstants');
const { getCategoryForAction, getActionsForCategory, isHighStakesAction,} = require('../../constants/auditLogCategories');
const { ADMIN_ROLES } = require('../../constants/adminRoles.constants');
const { toCSV, toPDF, formatStateChange, toRiskLabel } = require('../../utils/auditLogExport.util');
const UPPERCASE_WORDS = new Set([
  'KYC', '2FA', 'OTP', 'SMS', 'API', 'URL', 'ID', 'KYB', 'TOTP', 'PIN'
]);
const formatActionLabel = (action) => {
  if (!action) return 'N/A';
  return action
    .split('_')
    .map(word => {
      if (!word) return '';
      if (/^\d+$/.test(word)) return word;
      if (UPPERCASE_WORDS.has(word.toUpperCase())) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ')
    .trim();
};

const getAllActionOptions = () => {
  return [...new Set(Object.values(auditLogConstants))].map(value => ({
    value,
    label: formatActionLabel(value),
    category: getCategoryForAction(value),
    isHighStakes: isHighStakesAction(value),
  }));
};

const ADMIN_ROLE_LOOKUP_CONFIG = {
  rolesCollection: 'roles',
  roleNameField: 'roleName',
};

const EXPORT_MAX_ROWS = 50000;

const auditLogService = {};

auditLogService.getActionOptions = () => {
  return getAllActionOptions();
};

auditLogService.getRoleOptions = () => {
  return Object.values(ADMIN_ROLES).map(value => ({ value, label: value }));
};

const buildBaseAggregate = (request) => {
  const query = request?.query || {};
  const search = query.search || '';
  const action = query.action || '';
  const category = query.category || '';
  const role = query.role || '';
  const startDate = query.startDate || '';
  const endDate = query.endDate || '';

  const aggregateArray = [
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'userDetail',
        pipeline: [
          { $project: { fullName: 1, userType: 1 } }
        ]
      }
    },
    {
      $unwind: {
        path: '$userDetail',
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $lookup: {
        from: 'admins',          
        localField: 'adminId',
        foreignField: '_id',
        as: 'adminDetail',
        pipeline: [
          {
            $lookup: {
              from: ADMIN_ROLE_LOOKUP_CONFIG.rolesCollection,
              localField: 'roleId',
              foreignField: '_id',
              as: 'roleDocs'
            }
          },
          {
            $addFields: {
              roleName: {
                $cond: [
                  { $gt: [{ $size: '$roleDocs' }, 0] },
                  { $arrayElemAt: [`$roleDocs.${ADMIN_ROLE_LOOKUP_CONFIG.roleNameField}`, 0] },
                  null
                ]
              }
            }
          },
          { $project: { fullName: 1, roleName: 1 } }
        ]
      }
    },
    {
      $unwind: {
        path: '$adminDetail',
        preserveNullAndEmptyArrays: true
      }
    },

    {
      $addFields: {
        userDetail: {
          $cond: {
            if: { $ifNull: ['$userDetail._id', false] },
            then: '$userDetail',
            else: {
              $cond: {
                if: { $ifNull: ['$adminDetail._id', false] },
                then: {
                  fullName: '$adminDetail.fullName',
                  userType: { $ifNull: ['$actorRoleName', { $ifNull: ['$adminDetail.roleName', 'Admin'] }] }
                },
                else: {
                  fullName: 'Unknown',
                  userType: {
                    $cond: {
                      if: { $eq: ['$entity', 'ADMIN'] },
                      then: 'Admin',
                      else: { $ifNull: ['$entity', 'N/A'] }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },

    { $unset: 'adminDetail' }
  ];

  if (search) {
    aggregateArray.push({
      $match: {
        $or: [
          { 'userDetail.fullName': { $regex: search, $options: 'i' } },
          { 'userDetail.userType': { $regex: search, $options: 'i' } },
          { action: { $regex: search, $options: 'i' } }
        ]
      }
    });
  }

  let actionFilterList = [];
  if (action) {
    actionFilterList = String(action).split(',').map(a => a.trim()).filter(Boolean);
  } else if (category) {
    const categories = String(category).split(',').map(c => c.trim()).filter(Boolean);
    actionFilterList = categories.flatMap(getActionsForCategory);
  }
  if (actionFilterList.length) {
    aggregateArray.push({
      $match: { action: { $in: actionFilterList.map(a => new RegExp(`^${a}$`, 'i')) } }
    });
  }

  if (role) {
    const roles = String(role).split(',').map(r => r.trim()).filter(Boolean);
    aggregateArray.push({
      $match: {
        $or: roles.map(r => ({
          'userDetail.userType': { $regex: r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
        }))
      }
    });
  }

  if (startDate || endDate) {
    const createdAtMatch = {};
    if (startDate) createdAtMatch.$gte = new Date(startDate);
    if (endDate) createdAtMatch.$lte = new Date(endDate);
    aggregateArray.push({ $match: { createdAt: createdAtMatch } });
  }

  return { aggregateArray, appliedFilters: { search, action, category, role, startDate, endDate } };
};


const toFormattedRow = (log) => {
  const category = getCategoryForAction(log.action);
  const actorName = log.userDetail?.fullName || 'Unknown';
  const actorRole = log.userDetail?.userType || 'N/A';
  const timestampUTC = log.createdAt ? new Date(log.createdAt).toISOString() : null;

  return {
    ...log,
    ip: (log.ip || '').replace('::ffff:', ''),
    actionLabel: formatActionLabel(log.action),
    category,
    isHighStakes: isHighStakesAction(log.action),
    timestampUTC,
    actor: {
      name: actorName,
      role: actorRole,
    },
    entityReference: {
      type: log.entity || 'N/A',
      id: log.entityId || null,
    },
  };
};

const toExportRow = (formattedRow) => ({
  timestampUTC: formattedRow.timestampUTC,
  actorName: formattedRow.actor.name,
  actorRole: formattedRow.actor.role,
  action: formattedRow.action,
  actionLabel: formattedRow.actionLabel,
  category: formattedRow.category,
  entityType: formattedRow.entityReference.type,
  entityId: formattedRow.entityReference.id,
  stateChange: formatStateChange(formattedRow.fromState, formattedRow.toState),
  risk: toRiskLabel(formattedRow.isHighStakes),
  ip: formattedRow.ip,
});


auditLogService.get = async (request) => {
  const page = Number(request?.query?.page) || 1;
  const limit = Number(request?.query?.limit) || 10;
  const skip = (page - 1) * limit;
  const { aggregateArray } = buildBaseAggregate(request);
  aggregateArray.push(
    { $sort: { createdAt: -1 } },
    helper.applyPagination(skip, limit)
  );
  const data = await auditLogModel.aggregate(aggregateArray);
  const rawResults = data?.[0]?.paginatedResults || [];
  const formattedResults = rawResults.map(toFormattedRow);
  return {
    getData: formattedResults,
    count: data?.[0]?.totalCount?.[0]?.total || 0
  };
};

auditLogService.exportLogs = async (request) => {
  const format = (request?.query?.format || 'csv').toLowerCase();
  if (!['csv', 'pdf'].includes(format)) {
    const err = new Error('Invalid export format. Use "csv" or "pdf".');
    err.statusCode = 400;
    throw err;
  }
  const { aggregateArray, appliedFilters } = buildBaseAggregate(request);
  const countPipeline = [...aggregateArray, { $count: 'total' }];
  const countResult = await auditLogModel.aggregate(countPipeline);
  const totalCount = countResult?.[0]?.total || 0;
  if (totalCount === 0) {
    const err = new Error('No audit log entries match the given filters.');
    err.statusCode = 404;
    throw err;
  }
  if (totalCount > EXPORT_MAX_ROWS) {
    const err = new Error(
      `${totalCount} entries match your filters, which exceeds the ${EXPORT_MAX_ROWS}-row export limit. ` +
      `Please narrow the date range or filters and try again.`
    );
    err.statusCode = 400;
    throw err;
  }
  aggregateArray.push({ $sort: { createdAt: -1 } }, { $limit: EXPORT_MAX_ROWS });
  const rawResults = await auditLogModel.aggregate(aggregateArray);
  const exportRows = rawResults.map(toFormattedRow).map(toExportRow);
  const generatedAt = new Date().toISOString();
  const meta = { generatedAt, filters: appliedFilters, totalCount };
  const datePart = generatedAt.slice(0, 10);
  if (format === 'csv') {
    return {
      buffer: Buffer.from(toCSV(exportRows), 'utf-8'),
      contentType: 'text/csv; charset=utf-8',
      filename: `audit-log-export-${datePart}.csv`,
    };
  }
  const pdfBuffer = await toPDF(exportRows, meta);
  return {
    buffer: pdfBuffer,
    contentType: 'application/pdf',
    filename: `audit-log-export-${datePart}.pdf`,
  };
};

module.exports = auditLogService;
module.exports.formatActionLabel = formatActionLabel;