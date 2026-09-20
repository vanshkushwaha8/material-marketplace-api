const userModel = require('../../model/user.model');

async function registerToken({ userId, token }) {
  // Strip this token from every OTHER user first — a device can only
  // ever belong to one account's notification stream at a time. Without
  // this, logging into a shared/kiosk device with a second account would
  // leave the first account still receiving pushes meant for the second.
  await userModel.updateMany({ _id: { $ne: userId }, fcmTokens: token }, { $pull: { fcmTokens: token } });
  await userModel.updateOne({ _id: userId }, { $addToSet: { fcmTokens: token } });
}

async function removeToken({ userId, token }) {
  await userModel.updateOne({ _id: userId }, { $pull: { fcmTokens: token } });
}

// Called when FCM itself reports a token as dead (uninstalled app, expired, etc).
async function removeTokenGlobally(token) {
  await userModel.updateMany({ fcmTokens: token }, { $pull: { fcmTokens: token } });
}

module.exports = { registerToken, removeToken, removeTokenGlobally };