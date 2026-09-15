const mongoose = require('mongoose');
const reconRunSchema = require('../schema/reconRun.schema');
const reconRunModel = mongoose.model('reconRuns', reconRunSchema);
module.exports = reconRunModel;
