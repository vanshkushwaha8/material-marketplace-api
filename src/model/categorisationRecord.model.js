const mongoose = require('mongoose');
const categorisationRecordSchema = require('../schema/categorisationRecord.schema');
const categorisationRecordModel = mongoose.model('categorisationRecords', categorisationRecordSchema);
module.exports = categorisationRecordModel;
