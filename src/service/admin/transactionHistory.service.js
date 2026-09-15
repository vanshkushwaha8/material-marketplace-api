const offerModel = require('../../model/offer.model');
const deleteConstants = require('../../constants/delete.constants');
const { OFFER_STATES } = require('../../constants/offer.constants');

// "Transaction history" for now = accepted offers (spec/decision: no
// Transaction/payment model exists yet — Phase 3 should introduce a real
// one at the point an accepted offer moves to payment/settlement, and
// this service should then read from that instead).
async function list({ page = 1, limit = 20, search }) {
  const query = { status: OFFER_STATES.ACCEPTED, is_deleted: deleteConstants.NOT_DELETED };
  const pageNum = Math.max(1, Number(page) || 1);
  const pageLimit = Math.min(100, Number(limit) || 20);

  let listingIdFilter = null;
  if (search) {
    // Search matches against the populated listing's title — done as a
    // second query rather than an aggregation, since offer volume is low
    // enough that two round trips is simpler than a $lookup pipeline.
    const materialListingModel = require('../../model/materialListing.model');
    const matches = await materialListingModel.find({ title: { $regex: search, $options: 'i' } }).select('_id');
    listingIdFilter = matches.map((m) => m._id);
    query.listing = { $in: listingIdFilter };
  }

  const [getData, count] = await Promise.all([
    offerModel.find(query)
      .populate('listing', 'title price unit')
      .populate('buyer', 'fullName email')
      .populate('seller', 'fullName email')
      .sort({ updatedAt: -1 })
      .skip((pageNum - 1) * pageLimit)
      .limit(pageLimit)
      .lean(),
    offerModel.countDocuments(query),
  ]);

  return { getData, count, page: pageNum, limit: pageLimit };
}

module.exports = { list };
