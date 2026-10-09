const vehicleTypeModel = require('../../model/vehicleType.model');

// Starting catalogue, written once into vehicle_types the first time it is
// read empty. Payloads are typical Indian figures; admins edit them under
// Admin → Vehicle types. Ordered smallest → largest.
const DEFAULT_VEHICLE_TYPES = Object.freeze([
  { code: 'TATA_ACE', name: 'Tata Ace (mini truck)', maxPayloadKg: 750, autoRecommend: true, sortOrder: 10 },
  { code: 'PICKUP', name: 'Pickup', maxPayloadKg: 1500, autoRecommend: true, sortOrder: 20 },
  { code: 'MINI_TRUCK', name: 'Light truck (407 class)', maxPayloadKg: 2500, autoRecommend: true, sortOrder: 30 },
  { code: 'MEDIUM_TRUCK', name: 'Medium truck (14–17 ft)', maxPayloadKg: 7000, autoRecommend: true, sortOrder: 40 },
  { code: 'SIX_WHEELER', name: '6-wheeler truck', maxPayloadKg: 10000, autoRecommend: true, sortOrder: 50 },
  { code: 'TEN_WHEELER', name: '10-wheeler truck', maxPayloadKg: 18000, autoRecommend: true, sortOrder: 60 },
  { code: 'TWELVE_WHEELER', name: '12-wheeler truck', maxPayloadKg: 25000, autoRecommend: true, sortOrder: 70 },
  { code: 'TRAILER', name: 'Trailer', maxPayloadKg: 32000, autoRecommend: true, sortOrder: 80 },
  { code: 'TIPPER', name: 'Tipper (sand, aggregate)', maxPayloadKg: 16000, autoRecommend: false, sortOrder: 90 },
  { code: 'DUMPER', name: 'Dumper', maxPayloadKg: 25000, autoRecommend: false, sortOrder: 100 },
  { code: 'OTHER', name: 'Other', maxPayloadKg: null, autoRecommend: false, sortOrder: 1000 },
]);

const FIELDS = 'code name description maxPayloadKg autoRecommend sortOrder active';

async function ensureDefaults() {
  if (await vehicleTypeModel.estimatedDocumentCount() > 0) return;
  // ordered:false + unique code: a concurrent first read inserts the rest
  // and the duplicates are simply skipped.
  await vehicleTypeModel.insertMany(DEFAULT_VEHICLE_TYPES, { ordered: false }).catch((err) => {
    if (err?.code !== 11000 && !err?.writeErrors) throw err;
  });
}

async function listActive() {
  await ensureDefaults();
  return vehicleTypeModel.find({ active: true }).select(FIELDS).sort({ sortOrder: 1, maxPayloadKg: 1 }).lean();
}

async function findActiveByCode(code) {
  if (!code) return null;
  await ensureDefaults();
  return vehicleTypeModel.findOne({ code: String(code).toUpperCase(), active: true }).select(FIELDS).lean();
}

// What an order stores — never a live reference, so later admin edits
// can't rewrite history.
function snapshot(v) {
  return v ? { code: v.code, name: v.name, maxPayloadKg: v.maxPayloadKg ?? null } : null;
}

module.exports = { DEFAULT_VEHICLE_TYPES, ensureDefaults, listActive, findActiveByCode, snapshot };
