const express = require('express');
const responseConstants = require('../../constants/response.constatnts');
const statusCodes = require('../../constants/httpConstants');
const userTypeConstants = require('../../constants/usertype.constants');
const { authMiddleware, twoFactorAuthenticationCheck } = require('../../middleware/auth.middleware');
const { authapiLimiter } = require('../../utils/rateLimiter.utils');
const sellerDashboardService = require('../../service/app/sellerDashboard.service');
const router = express.Router();

// Single aggregate behind the seller dashboard (KPIs + action centre).
router.get(
  '/seller/dashboard-summary',
  authapiLimiter({ windowMs: 15 * 60 * 1000, max: 200 }),
  authMiddleware([userTypeConstants.Seller]),
  twoFactorAuthenticationCheck,
  async (request, response, nextFunction) => {
    try {
      const summary = await sellerDashboardService.getSummary(request.auth._id);
      return responseConstants.success(response, 'Seller dashboard summary fetched', summary, statusCodes.OK);
    } catch (error) {
      return nextFunction(error);
    }
  }
);

module.exports = router;
