const responseConstants = require('../../../constants/response.constatnts');
const statusCodes = require('../../../constants/httpConstants');
const auditLogBulkExportService = require('../../../service/admin/auditLog/auditLogBulkExport.service');
const auditLogBulkExportValidation = require('../../../validation/admin/auditLog/auditLogBulkExport.validation');

class AuditLogBulkExportController {
  createJob = async (request, response, nextFunction) => {
    try {
      const { error, value } = auditLogBulkExportValidation.validateCreateJob(request.body);
      const validationError = responseConstants.validatIonError(response, error);
      if (validationError) return;
      const job = await auditLogBulkExportService.createExportJob({
        filters: value.filters,
        adminId: request.auth._id,
        req: request,
      });
      return responseConstants.success(
        response,
        'Export job created. It will continue running in the background — poll its status for progress.',
        job,
        statusCodes.ACCEPTED
      );
    } catch (err) {
      if (err.statusCode) return responseConstants.BadRequest(response, err.message, null, err.statusCode);
      nextFunction(err);
    }
  };

  getStatus = async (request, response, nextFunction) => {
    try {
      const job = await auditLogBulkExportService.getJobStatus(request.params.jobId, request.auth);
      const progressEstimate = auditLogBulkExportService.computeProgressEstimate(job);
      const data = { ...job.toObject(), ...progressEstimate };
      return responseConstants.success(response, 'Export job status fetched successfully', data, statusCodes.OK);
    } catch (err) {
      if (err.statusCode) return responseConstants.BadRequest(response, err.message, null, err.statusCode);
      nextFunction(err);
    }
  };

  download = async (request, response, nextFunction) => {
    try {
      await auditLogBulkExportService.streamDownload(request.params.jobId, request.auth, request, response);
    } catch (err) {
      if (err.statusCode) {
        return response.status(err.statusCode).json({ success: false, message: err.message });
      }
      nextFunction(err);
    }
  };
}

module.exports = new AuditLogBulkExportController();
