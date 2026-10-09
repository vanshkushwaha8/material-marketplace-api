const mongoose = require('mongoose');
const vehicleTypeSchema = require('../schema/vehicleType.schema');
module.exports = mongoose.model('vehicle_types', vehicleTypeSchema);
