// Units construction materials are commonly quantified in. Extend this
// list rather than hard-coding new unit strings elsewhere.
const MATERIAL_UNITS = Object.freeze([
  'bag', 'rod', 'roll', 'box', 'piece', 'meter', 'sq_meter',
  'kg', 'ton', 'liter', 'bundle', 'pallet', 'other',
]);

module.exports = { MATERIAL_UNITS };
