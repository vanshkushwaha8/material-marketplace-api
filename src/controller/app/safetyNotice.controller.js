const Joi = require('joi');
const responseConstants = require('../../constants/response.constatnts');
const statusCodes = require('../../constants/httpConstants');
const safetyNoticeService = require('../../service/app/safetyNotice.service');

const recordSchema = Joi.object({
  version: Joi.string().trim().max(40).required(),
  action: Joi.string().valid('ACKNOWLEDGED', 'DISMISSED').required(),
});

class SafetyNoticeController {
  status = async (request, response, nextFunction) => {
    try {
      const data = await safetyNoticeService.getStatus(request.auth._id);
      return responseConstants.success(response, 'Safety notice status', data, statusCodes.OK);
    } catch (error) {
      if (error instanceof safetyNoticeService.SafetyNoticeError) return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      nextFunction(error);
    }
  };

  record = async (request, response, nextFunction) => {
    try {
      const { error, value } = recordSchema.validate(request.body || {}, { abortEarly: true, stripUnknown: true });
      const validationError = responseConstants.validatIonError(response, error);
      if (validationError) return;
      const data = await safetyNoticeService.record({ userId: request.auth._id, version: value.version, action: value.action, req: request });
      return responseConstants.success(response, 'Saved', data, statusCodes.OK);
    } catch (error) {
      if (error instanceof safetyNoticeService.SafetyNoticeError) return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      nextFunction(error);
    }
  };
}

module.exports = new SafetyNoticeController();
