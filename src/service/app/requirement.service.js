const mongoose = require('mongoose');
const requirementModel = require('../../model/requirement.model');
const requirementResponseModel = require('../../model/requirementResponse.model');
const deleteConstants = require('../../constants/delete.constants');
const { REQUIREMENT_STATES, REQUIREMENT_OPEN_STATES } = require('../../constants/requirement.constants');
const notificationService = require('./notification.service');
const { NOTIFICATION_TYPES } = require('../../constants/notification.constants');

class RequirementError extends Error {
  constructor(message, statusCode = 400) { super(message); this.name = 'RequirementError'; this.statusCode = statusCode; }
}

async function createRequirement({ buyerId, body }) {
  return requirementModel.create({ buyer: buyerId, ...body });
}

async function myRequirements({ buyerId, page = 1, limit = 20 }) {
  const query = { buyer: buyerId, is_deleted: deleteConstants.NOT_DELETED };
  const pageNum = Math.max(1, Number(page) || 1);
  const pageLimit = Math.min(100, Number(limit) || 20);
  const [getData, count] = await Promise.all([
    requirementModel.find(query).sort({ createdAt: -1 }).skip((pageNum - 1) * pageLimit).limit(pageLimit).lean(),
    requirementModel.countDocuments(query),
  ]);
  return { getData, count, page: pageNum, limit: pageLimit };
}

// Sellers browse open requirements — never their own irrelevant ones,
// never closed/expired/fulfilled ones.
async function browseOpenRequirements({ page = 1, limit = 20 }) {
  const query = { status: { $in: REQUIREMENT_OPEN_STATES }, is_deleted: deleteConstants.NOT_DELETED };
  const pageNum = Math.max(1, Number(page) || 1);
  const pageLimit = Math.min(100, Number(limit) || 20);
  const [getData, count] = await Promise.all([
    requirementModel.find(query).populate('buyer', 'fullName location.city location.state').sort({ createdAt: -1 }).skip((pageNum - 1) * pageLimit).limit(pageLimit).lean(),
    requirementModel.countDocuments(query),
  ]);
  return { getData, count, page: pageNum, limit: pageLimit };
}

async function respondToRequirement({ requirementId, sellerId, body, req }) {
  if (!mongoose.Types.ObjectId.isValid(requirementId)) throw new RequirementError('Invalid requirement id', 404);
  const requirement = await requirementModel.findOne({ _id: requirementId, is_deleted: deleteConstants.NOT_DELETED });
  if (!requirement) throw new RequirementError('Requirement not found', 404);
  if (!REQUIREMENT_OPEN_STATES.includes(requirement.status)) throw new RequirementError('This requirement is no longer open', 409);

  let response;
  try {
    response = await requirementResponseModel.create({ requirement: requirementId, seller: sellerId, ...body });
  } catch (err) {
    if (err.code === 11000) throw new RequirementError('You already responded to this requirement', 409);
    throw err;
  }

  requirement.responseCount += 1;
  if (requirement.status === REQUIREMENT_STATES.ACTIVE) requirement.status = REQUIREMENT_STATES.RESPONSES_RECEIVED;
  await requirement.save();

  await notificationService.createNotification({
    recipientId: requirement.buyer, type: NOTIFICATION_TYPES.OFFER_RECEIVED, // reusing — a requirement response is conceptually the same "someone made you an offer" event
    title: 'Seller responded to your requirement',
    message: `A seller quoted for your requirement: ${requirement.material}`,
    entityType: 'listing', entityId: requirement._id,
  });
  return response;
}

async function getResponses({ requirementId, buyerId }) {
  const requirement = await requirementModel.findOne({ _id: requirementId, buyer: buyerId, is_deleted: deleteConstants.NOT_DELETED });
  if (!requirement) throw new RequirementError('Requirement not found', 404);
  return requirementResponseModel.find({ requirement: requirementId, is_deleted: deleteConstants.NOT_DELETED })
    .populate('seller', 'fullName sellerType storeName').sort({ createdAt: -1 }).lean();
}

async function closeRequirement({ requirementId, buyerId }) {
  const requirement = await requirementModel.findOneAndUpdate(
    { _id: requirementId, buyer: buyerId, is_deleted: deleteConstants.NOT_DELETED },
    { $set: { status: REQUIREMENT_STATES.CLOSED } },
    { new: true }
  );
  if (!requirement) throw new RequirementError('Requirement not found', 404);
  return requirement;
}

module.exports = { RequirementError, createRequirement, myRequirements, browseOpenRequirements, respondToRequirement, getResponses, closeRequirement };