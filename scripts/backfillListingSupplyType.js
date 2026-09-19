// One-off backfill for the new `supplyType` field on material_listings
// (spec: "existing users/listings must not break after migration").
// Every listing created before this field existed was created by what is
// now classified an INDIVIDUAL seller (Business/Store sellers didn't
// exist yet), so supplyType is derived from the existing `condition`
// value rather than defaulted blindly:
//   new_surplus / excess_project_inventory / project_cancellation_inventory
//   / over_purchased / used            -> SURPLUS
//   unused_inventory                   -> NEW_UNUSED
// Run once: node scripts/backfillListingSupplyType.js
const mongoose = require('mongoose');
const configenv = require('../src/config/env.config');
const materialListingModel = require('../src/model/materialListing.model');
const { CONDITION_TYPES, SUPPLY_TYPES } = require('../src/constants/materialListing.constants');

async function run() {
  await mongoose.connect(configenv.MONGODB_URL + configenv.MONGODB_NAME);
  const result = await materialListingModel.updateMany(
    { supplyType: { $exists: false } },
    [
      {
        $set: {
          supplyType: {
            $cond: [
              { $eq: ['$condition', CONDITION_TYPES.UNUSED_INVENTORY] },
              SUPPLY_TYPES.NEW_UNUSED,
              SUPPLY_TYPES.SURPLUS,
            ],
          },
        },
      },
    ]
  );
  console.log(`Backfilled ${result.modifiedCount} listings with a derived supplyType.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
