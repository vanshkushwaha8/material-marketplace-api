const auditLogService = require('./auditLog.service');
const dashboardService = {};
dashboardService.getActivityFeed = async (request) => {
    const feedRequest = {
        ...request,
        query: { ...request.query, page: 1, limit: Number(request?.query?.limit) || 10 },
    };
    const result = await auditLogService.get(feedRequest);
    return result;
};

module.exports = dashboardService;