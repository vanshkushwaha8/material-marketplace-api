const deliveryRateSettingModel = require('../../model/deliveryRateSetting.model');
const configenv = require('../../config/env.config');
const { createAuditLogAdmin } = require('../../helper/audit.helper');
const auditLogConstants = require('../../constants/auditLogConstants');

class DeliveryRateError extends Error {
  constructor(message, statusCode = 400, code = null) { super(message); this.name = 'DeliveryRateError'; this.statusCode = statusCode; this.code = code; }
}

const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' ? Number(v) : d);

// Rate card until an admin saves one.
function defaultRates() {
  return {
    _id: null,
    baseCharge: num(configenv.DELIVERY_BASE_CHARGE, 50),
    perKm: num(configenv.DELIVERY_PER_KM, 10),
    perKg: num(configenv.DELIVERY_PER_KG, 0.5),
    maxDistanceKm: num(configenv.DELIVERY_MAX_KM, 50),
    isDefault: true,
  };
}

async function getCurrentRates() {
  const row = await deliveryRateSettingModel.findOne().sort({ createdAt: -1 }).lean();
  return row ? { ...row, isDefault: false } : defaultRates();
}

async function history({ page = 1, limit = 20 } = {}) {
  const pageNum = Math.max(1, Number(page) || 1);
  const pageLimit = Math.min(100, Number(limit) || 20);
  const [rows, count] = await Promise.all([
    deliveryRateSettingModel.find().sort({ createdAt: -1 }).skip((pageNum - 1) * pageLimit).limit(pageLimit)
      .populate('changedBy', 'fullName email').lean(),
    deliveryRateSettingModel.countDocuments(),
  ]);
  return { getData: rows, count, page: pageNum, limit: pageLimit };
}

async function update({ baseCharge, perKm, perKg, maxDistanceKm, reason, adminId, req }) {
  const previous = await getCurrentRates();
  const row = await deliveryRateSettingModel.create({ baseCharge, perKm, perKg, maxDistanceKm, reason, changedBy: adminId });
  await createAuditLogAdmin({
    req, adminId, action: auditLogConstants.DELIVERY_RATES_UPDATED, entity: 'delivery_rate_settings', entityId: row._id, reason,
    metadata: { previous: { baseCharge: previous.baseCharge, perKm: previous.perKm, perKg: previous.perKg, maxDistanceKm: previous.maxDistanceKm }, next: { baseCharge, perKm, perKg, maxDistanceKm } },
  });
  return row;
}

// Straight-line (great-circle) distance in km between two [lng, lat] points.
function haversineKm([lng1, lat1], [lng2, lat2]) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Delivery charge for one order. Server-only — the client never supplies
 * a distance, weight or amount.
 * @param {{ from: [lng, lat], to: [lng, lat], weightKg: number }} p
 */
async function quote({ from, to, weightKg }) {
  if (!Array.isArray(from) || from.length !== 2) {
    throw new DeliveryRateError('Delivery isn\'t available for this store yet — it hasn\'t pinned its location. Please choose store pickup.', 409, 'STORE_LOCATION_MISSING');
  }
  if (!Array.isArray(to) || to.length !== 2 || to.some((v) => !Number.isFinite(Number(v)))) {
    throw new DeliveryRateError('This address has no map location — edit it and pick the location on the map', 409, 'ADDRESS_LOCATION_MISSING');
  }
  const rates = await getCurrentRates();
  const distanceKm = Math.round(haversineKm(from, to.map(Number)) * 10) / 10;
  if (distanceKm > rates.maxDistanceKm) {
    throw new DeliveryRateError(`This address is ${distanceKm} km from the store — delivery is available up to ${rates.maxDistanceKm} km. Choose store pickup or a closer address.`, 409, 'OUT_OF_DELIVERY_RANGE');
  }
  const weight = Math.max(0, Number(weightKg) || 0);
  const distancePart = rates.perKm * distanceKm;
  const weightPart = rates.perKg * weight;
  // Whole rupees, rounded up — never a fractional delivery charge.
  const charge = Math.ceil(rates.baseCharge + distancePart + weightPart);
  return {
    distanceKm,
    weightKg: Math.round(weight * 100) / 100,
    charge,
    breakdown: {
      baseCharge: rates.baseCharge,
      distanceCharge: Math.round(distancePart * 100) / 100,
      weightCharge: Math.round(weightPart * 100) / 100,
      perKm: rates.perKm,
      perKg: rates.perKg,
    },
    rateSettingId: rates._id,
  };
}

module.exports = { DeliveryRateError, getCurrentRates, history, update, quote, haversineKm };
