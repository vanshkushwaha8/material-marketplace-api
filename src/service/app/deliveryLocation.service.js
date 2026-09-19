const mongoose = require('mongoose');
const deliveryLocationModel = require('../../model/deliveryLocation.model');
const deleteConstants = require('../../constants/delete.constants');
const { createAuditLog } = require('../../helper/audit.helper');
const auditLogConstants = require('../../constants/auditLogConstants');

const MAX_LOCATIONS_PER_BUYER = 20;

class DeliveryLocationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'DeliveryLocationError';
    this.statusCode = statusCode;
  }
}

async function list({ buyerId }) {
  const getData = await deliveryLocationModel
    .find({ buyer: buyerId, is_deleted: deleteConstants.NOT_DELETED })
    .sort({ isDefault: -1, createdAt: -1 })
    .lean();
  return { getData, count: getData.length };
}

async function create({ buyerId, body, req }) {
  const existingCount = await deliveryLocationModel.countDocuments({ buyer: buyerId, is_deleted: deleteConstants.NOT_DELETED });
  if (existingCount >= MAX_LOCATIONS_PER_BUYER) {
    throw new DeliveryLocationError(`You can save up to ${MAX_LOCATIONS_PER_BUYER} delivery locations`);
  }

  // First location for this buyer is always the default, regardless of
  // what was sent — there's no meaningful "not default" state with only
  // one saved location.
  const isFirst = existingCount === 0;
  const isDefault = isFirst ? true : !!body.isDefault;

  if (isDefault && !isFirst) {
    await deliveryLocationModel.updateMany(
      { buyer: buyerId, is_deleted: deleteConstants.NOT_DELETED },
      { $set: { isDefault: false } }
    );
  }

  const created = await deliveryLocationModel.create({
    buyer: buyerId,
    label: body.label,
    address: body.address,
    isDefault,
  });

  await createAuditLog({ req, userId: buyerId, action: auditLogConstants.DELIVERY_LOCATION_CREATED, entity: 'delivery_locations', entityId: created._id });
  return created.toObject();
}

async function update({ buyerId, locationId, body, req }) {
  if (!mongoose.Types.ObjectId.isValid(locationId)) throw new DeliveryLocationError('Invalid location id');

  const location = await deliveryLocationModel.findOne({ _id: locationId, buyer: buyerId, is_deleted: deleteConstants.NOT_DELETED });
  if (!location) throw new DeliveryLocationError('Delivery location not found', 404);

  if (body.isDefault === true && !location.isDefault) {
    await deliveryLocationModel.updateMany(
      { buyer: buyerId, is_deleted: deleteConstants.NOT_DELETED, _id: { $ne: locationId } },
      { $set: { isDefault: false } }
    );
    location.isDefault = true;
  } else if (body.isDefault === false && location.isDefault) {
    // Refuse to leave the buyer with zero default locations while others
    // still exist — use the dedicated setDefault action on another
    // location instead, which flips both sides atomically.
    const otherCount = await deliveryLocationModel.countDocuments({ buyer: buyerId, is_deleted: deleteConstants.NOT_DELETED, _id: { $ne: locationId } });
    if (otherCount > 0) throw new DeliveryLocationError('Set another location as default instead of unsetting this one');
  }

  if (body.label !== undefined) location.label = body.label;
  if (body.address !== undefined) location.address = body.address;
  await location.save();

  await createAuditLog({ req, userId: buyerId, action: auditLogConstants.DELIVERY_LOCATION_UPDATED, entity: 'delivery_locations', entityId: locationId });
  return location.toObject();
}

async function setDefault({ buyerId, locationId, req }) {
  if (!mongoose.Types.ObjectId.isValid(locationId)) throw new DeliveryLocationError('Invalid location id');

  const location = await deliveryLocationModel.findOne({ _id: locationId, buyer: buyerId, is_deleted: deleteConstants.NOT_DELETED });
  if (!location) throw new DeliveryLocationError('Delivery location not found', 404);

  await deliveryLocationModel.updateMany(
    { buyer: buyerId, is_deleted: deleteConstants.NOT_DELETED, _id: { $ne: locationId } },
    { $set: { isDefault: false } }
  );
  location.isDefault = true;
  await location.save();

  await createAuditLog({ req, userId: buyerId, action: auditLogConstants.DELIVERY_LOCATION_DEFAULT_SET, entity: 'delivery_locations', entityId: locationId });
  return location.toObject();
}

async function remove({ buyerId, locationId, req }) {
  if (!mongoose.Types.ObjectId.isValid(locationId)) throw new DeliveryLocationError('Invalid location id');

  const location = await deliveryLocationModel.findOne({ _id: locationId, buyer: buyerId, is_deleted: deleteConstants.NOT_DELETED });
  if (!location) throw new DeliveryLocationError('Delivery location not found', 404);

  location.is_deleted = deleteConstants.DELETED;
  await location.save();

  // If the default location was just deleted, promote the next most
  // recent remaining one so the buyer never silently ends up with zero
  // default locations while some still exist.
  if (location.isDefault) {
    const next = await deliveryLocationModel.findOne({ buyer: buyerId, is_deleted: deleteConstants.NOT_DELETED }).sort({ createdAt: -1 });
    if (next) {
      next.isDefault = true;
      await next.save();
    }
  }

  await createAuditLog({ req, userId: buyerId, action: auditLogConstants.DELIVERY_LOCATION_DELETED, entity: 'delivery_locations', entityId: locationId });
  return { deleted: true };
}

module.exports = { DeliveryLocationError, list, create, update, setDefault, remove };
