const mongoose = require('mongoose');

const knowledgeTestAttemptSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
      required: true,
    },
    questionBankVersion: { type: String },
    answers: [
      {
        questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'questions', required: true },
        selectedOptionIndex: { type: Number, required: true },
        isCorrect: { type: Boolean, required: true },
      },
    ],
    score: { type: Number, required: true }, // 0-100
    threshold: { type: Number, required: true },
    passed: { type: Boolean, required: true },
    art21WarningSeen: { type: Boolean, default: false },
    art21WarningAcknowledgedAt: { type: Date },
    proceedAfterWarning: { type: Boolean },
    attemptedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

knowledgeTestAttemptSchema.index({ userId: 1, attemptedAt: -1 });

module.exports = knowledgeTestAttemptSchema;
