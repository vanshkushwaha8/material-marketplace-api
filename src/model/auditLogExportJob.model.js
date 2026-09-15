const mongoose = require('mongoose');
const auditLogExportJobSchema = require('../schema/auditLogExportJob.schema');
const auditLogExportJobModel = mongoose.model('auditLogExportJobs', auditLogExportJobSchema);
module.exports = auditLogExportJobModel;
