const mongoose = require('mongoose');
const lossBearingSimulationSchema = require('../schema/lossBearingSimulation.schema');
const lossBearingSimulationModel = mongoose.model('lossBearingSimulations', lossBearingSimulationSchema);
module.exports = lossBearingSimulationModel;
