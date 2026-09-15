const mongoose = require('mongoose');
const otpSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    otp: {
      type: String,
    },
    expireOn: {
      type: Date,
      default: () => new Date(Date.now() + 2 * 60 * 1000)
    }
  },
  { timestamps: true }
);
otpSchema.index({ expireOn: 1 }, { expireAfterSeconds: 0 });
module.exports = otpSchema
