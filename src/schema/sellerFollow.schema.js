const mongoose = require('mongoose');

// A buyer following a seller. One row per (buyer, seller) — the unique
// index makes follow idempotent even under double-clicks / parallel
// requests. Unfollow deletes the row (no soft-delete: there is no history
// worth keeping and re-following must just work).
const sellerFollowSchema = new mongoose.Schema(
  {
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true, immutable: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true, immutable: true, index: true },
  },
  { timestamps: true }
);

sellerFollowSchema.index({ buyer: 1, seller: 1 }, { unique: true });
module.exports = sellerFollowSchema;
