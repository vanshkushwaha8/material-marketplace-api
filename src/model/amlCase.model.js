const mongoose = require('mongoose');
const amlCaseSchema = require('../schema/amlCase.schema');
const amlCaseModel = mongoose.model('amlCases', amlCaseSchema);
module.exports = amlCaseModel;
