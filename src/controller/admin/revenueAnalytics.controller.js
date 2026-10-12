const responseConstants = require('../../constants/response.constatnts');
const statusCodes = require('../../constants/httpConstants');
const revenueAnalyticsService = require('../../service/admin/revenueAnalytics.service');
const { createAuditLogAdmin } = require('../../helper/audit.helper');
const auditLogConstants = require('../../constants/auditLogConstants');

const handle = (fn) => async (request, response, nextFunction) => {
  try {
    return await fn(request, response);
  } catch (error) {
    if (error instanceof revenueAnalyticsService.AnalyticsError) return responseConstants.BadRequest(response, error.message, null, error.statusCode);
    nextFunction(error);
  }
};

class RevenueAnalyticsController {
  overview = handle(async (request, response) => {
    const data = await revenueAnalyticsService.overview(request.query);
    return responseConstants.success(response, 'Commission & revenue analytics', data, statusCodes.OK);
  });

  orders = handle(async (request, response) => {
    const data = await revenueAnalyticsService.orders(request.query);
    return responseConstants.success(response, 'Commission & revenue orders', data, statusCodes.OK);
  });

  // Financial export — audited like other admin data exports.
  exportCsv = handle(async (request, response) => {
    const { csv, truncated } = await revenueAnalyticsService.exportCsv(request.query);
    await createAuditLogAdmin({
      req: request, adminId: request.auth?._id, action: auditLogConstants.ADMIN_REVENUE_EXPORT,
      entity: 'transactions', metadata: { filters: request.query, truncated },
    }).catch(() => { });
    response.set('Content-Type', 'text/csv; charset=utf-8');
    response.set('Content-Disposition', `attachment; filename="commission-revenue-${new Date().toISOString().slice(0, 10)}.csv"`);
    response.set('Cache-Control', 'no-store');
    if (truncated) response.set('X-Export-Truncated', 'true');
    return response.status(statusCodes.OK).send(`﻿${csv}`);
  });
}

module.exports = new RevenueAnalyticsController();
