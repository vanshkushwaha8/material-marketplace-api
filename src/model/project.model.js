const mongoose = require('mongoose');
const projectSchema = require('../schema/project.schema');
module.exports = mongoose.model('projects', projectSchema);