const mongoose = require('mongoose');
const vehicleTypeModel = require('../../model/vehicleType.model');
const { ensureDefaults } = require('../app/vehicleType.service');
const { createAuditLogAdmin } = require('../../helper/audit.helper');
const auditLogConstants = require('../../constants/auditLogConstants');

class VehicleTypeError extends Error {
  constructor(message, statusCode = 400) { super(message); this.name = 'VehicleTypeError'; this.statusCode = statusCode; }
}

// Admin catalogue of delivery vehicles. Orders keep their own snapshot, so
// editing or deactivating a vehicle only affects new delivery requests.
// There is no delete: deactivate instead, so history stays readable.
async function list() {
  await ensureDefaults();
  return vehicleTypeModel.find().sort({ sortOrder: 1, maxPayloadKg: 1 }).lean();
}

async function create({ body, adminId, req }) {
  const exists = await vehicleTypeModel.exists({ code: body.code });
  if (exists) throw new VehicleTypeError(`A vehicle with code ${body.code} already exists`, 409);
  const row = await vehicleTypeModel.create(body);
  await createAuditLogAdmin({
    req, adminId, action: auditLogConstants.VEHICLE_TYPE_CREATED, entity: 'vehicle_types', entityId: row._id,
    reason: body.reason || '', metadata: { next: row.toObject() },
  });
  return row;
}

async function update({ id, body, adminId, req }) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new VehicleTypeError('Vehicle type not found', 404);
  const previous = await vehicleTypeModel.findById(id).lean();
  if (!previous) throw new VehicleTypeError('Vehicle type not found', 404);
  const { reason, ...changes } = body;
  const row = await vehicleTypeModel.findByIdAndUpdate(id, { $set: changes }, { new: true, runValidators: true }).lean();
  await createAuditLogAdmin({
    req, adminId, action: auditLogConstants.VEHICLE_TYPE_UPDATED, entity: 'vehicle_types', entityId: row._id,
    reason: reason || '',
    metadata: {
      previous: { name: previous.name, maxPayloadKg: previous.maxPayloadKg, autoRecommend: previous.autoRecommend, sortOrder: previous.sortOrder, active: previous.active },
      next: changes,
    },
  });
  return row;
}

module.exports = { VehicleTypeError, list, create, update };
