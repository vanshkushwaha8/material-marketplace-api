// One-off backfill for listings created before the partial-quantity model.
// Run once: node src/scripts/backfillListingInventory.js
// Any listing that never had a reservation under the old model gets its
// full `quantity` treated as available.
const mongoose = require('mongoose');
const configenv = require('../config/env.config');
const materialListingModel = require('../model/materialListing.model');

async function run() {
  await mongoose.connect(configenv.MONGODB_URL + configenv.MONGODB_NAME);
  const result = await materialListingModel.updateMany(
    { availableQuantity: { $exists: false } },
    [
      {
        $set: {
          availableQuantity: '$quantity',
          reservedQuantity: 0,
          soldQuantity: 0,
        },
      },
    ]
  );
  console.log(`Backfilled ${result.modifiedCount} listings.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});