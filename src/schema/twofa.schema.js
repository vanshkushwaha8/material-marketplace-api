const mongoose = require('mongoose');
const recoveryCodeSchema = new mongoose.Schema(
  {
    codeHash: { type: String, required: true },   
    usedAt:   { type: Date,   default: null },     
  },
  { _id: false }
);

const twofaSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      unique: true,
    },
    totpSecret: {
      type: String,              
      default: null,
    },
    totpVerified: {          
      type: Boolean,
      default: false,
    },
    emailFallbackEnabled: {
      type: Boolean,
      default: false,
    },
    fallbackEmail: {
      type: String,
      default: null,
    },

    activeMethod: {
      type: String,
      enum: ['totp', 'email'],
      default: 'totp',
    },

    recoveryCodes: {
      type: [recoveryCodeSchema],
      default: [],
    },
    recoveryAcknowledgedAt: {     
      type: Date,
      default: null,
    },

    pendingToken: {
      type: String,
      default: null,
    },
    pendingTokenExpiry: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = twofaSchema;