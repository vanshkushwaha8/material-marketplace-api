// One-off backfill for the new `sellerType` field on User (spec:
// "existing users must not break after migration — safe defaults for
// existing records"). Every existing Seller predates the
// Individual/Business-Store distinction, so they're all treated as
// INDIVIDUAL — the lower-friction default that doesn't require a store
// profile and matches how they've been listing materials until now.
// Run once: node scripts/backfillSellerType.js
const mongoose = require('mongoose');
const configenv = require('../src/config/env.config');
const userModel = require('../src/model/user.model');
const userTypeConstants = require('../src/constants/usertype.constants');
const { SELLER_TYPES } = require('../src/constants/sellerType.constants');

async function run() {
  await mongoose.connect(configenv.MONGODB_URL + configenv.MONGODB_NAME);
  const result = await userModel.updateMany(
    { userType: userTypeConstants.Seller, sellerType: { $exists: false } },
    { $set: { sellerType: SELLER_TYPES.INDIVIDUAL } }
  );
  console.log(`Backfilled ${result.modifiedCount} sellers to sellerType=INDIVIDUAL.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
