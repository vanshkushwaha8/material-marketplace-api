const mongoose = require('mongoose');
const auditLogsSchema = require("../schema/auditLogs.schema");
const auditLogsModel = mongoose.model('auditLogs',auditLogsSchema);
module.exports = auditLogsModel;