const materialListingModel = require('../../model/materialListing.model');
const { UNIT_WEIGHT_KG } = require('../../constants/delivery.constants');
const vehicleTypeService = require('./vehicleType.service');

// What an order physically needs moved, and which vehicle the platform
// suggests for it. The suggestion is advice only — the buyer requests a
// vehicle and the seller approves or changes it (deliveryQuote.service).
//
// Works over order LINES so a multi-product store order is the same call
// with more lines. Rules live here, server-side, so they can grow (volume,
// material class, length) without touching the UI.

function lineWeightPerUnitKg({ unit, weightPerUnitKg }) {
  if (weightPerUnitKg != null && Number.isFinite(Number(weightPerUnitKg))) return Number(weightPerUnitKg);
  return UNIT_WEIGHT_KG[unit] ?? null;
}

/**
 * @param {{ quantity: number, unit: string, weightPerUnitKg?: number|null }[]} lines
 * @returns {{ totalWeightKg: number|null, weightKnown: boolean, unknownLines: number }}
 *   totalWeightKg is null when any line's weight is unknown — a partial
 *   total would recommend a vehicle that is too small.
 */
function computeRequirement(lines) {
  let total = 0;
  let unknownLines = 0;
  for (const line of lines || []) {
    const perUnit = lineWeightPerUnitKg(line);
    if (perUnit == null) { unknownLines += 1; continue; }
    total += perUnit * Math.max(0, Number(line.quantity) || 0);
  }
  const weightKnown = unknownLines === 0 && (lines || []).length > 0;
  return { totalWeightKg: weightKnown ? Math.round(total * 100) / 100 : null, weightKnown, unknownLines };
}

/**
 * Smallest auto-recommendable vehicle whose payload covers the weight.
 * Heavier than every vehicle → the largest one, flagged multipleTrips.
 * @returns {{ vehicle: object|null, multipleTrips: boolean }}
 */
function recommendVehicle(totalWeightKg, vehicles) {
  if (totalWeightKg == null) return { vehicle: null, multipleTrips: false };
  const candidates = (vehicles || [])
    .filter((v) => v.autoRecommend && v.maxPayloadKg != null)
    .sort((a, b) => a.maxPayloadKg - b.maxPayloadKg);
  if (!candidates.length) return { vehicle: null, multipleTrips: false };
  const fit = candidates.find((v) => v.maxPayloadKg >= totalWeightKg);
  return fit ? { vehicle: fit, multipleTrips: false } : { vehicle: candidates[candidates.length - 1], multipleTrips: true };
}

// Order lines of a (today single-listing) transaction.
async function linesForTransaction(txn) {
  const listing = await materialListingModel.findById(txn.listing?._id || txn.listing).select('unit weightPerUnitKg').lean();
  return [{ quantity: txn.agreedQuantity, unit: listing?.unit, weightPerUnitKg: listing?.weightPerUnitKg ?? null }];
}

async function forTransaction(txn) {
  const [lines, vehicles] = await Promise.all([linesForTransaction(txn), vehicleTypeService.listActive()]);
  const requirement = computeRequirement(lines);
  const { vehicle, multipleTrips } = recommendVehicle(requirement.totalWeightKg, vehicles);
  return { ...requirement, recommendedVehicle: vehicleTypeService.snapshot(vehicle), multipleTrips, vehicles };
}

module.exports = { computeRequirement, recommendVehicle, forTransaction, lineWeightPerUnitKg };
