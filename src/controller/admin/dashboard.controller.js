const dashboardService = require('../../service/admin/dashboard.service');
const responseConstants = require('../../constants/response.constatnts');
const statusCodes = require('../../constants/httpConstants');

class DashboardController {
  activityFeed = async (request, response, nextFunction) => {
    try {
      const result = await dashboardService.getActivityFeed(request);
      return responseConstants.success(response, 'Activity feed', result, statusCodes.OK);
    } catch (error) {
      nextFunction(error);
    }
  };
}

module.exports = new DashboardController();