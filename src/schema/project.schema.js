const mongoose = require('mongoose');
const { PROJECT_TYPES, PROJECT_STATES } = require('../constants/project.constants');
const deleteConstants = require('../constants/delete.constants');

const projectSchema = new mongoose.Schema(
  {
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true, index: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: PROJECT_TYPES, default: 'Other' },
    location: { type: String, required: true, trim: true },
    expectedCompletion: { type: Date, default: null },
    materialsRequired: { type: Number, min: 0, default: 0 },
    // Manual counter for now — auto-computing this from completed
    // Transactions needs a `project` reference added to Offer/Transaction,
    // which doesn't exist yet (see report). Buyer increments this
    // themselves via markMaterialSourced() below in the meantime.
    materialsSourced: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: Object.values(PROJECT_STATES), default: PROJECT_STATES.ACTIVE, index: true },
    is_deleted: { type: String, enum: [deleteConstants.NOT_DELETED, deleteConstants.DELETED], default: deleteConstants.NOT_DELETED, index: true },
  },
  { timestamps: true }
);

module.exports = projectSchema;