const userModel = require('../../model/user.model');

async function registerToken({ userId, token }) {
  await userModel.updateOne({ _id: userId }, { $addToSet: { fcmTokens: token } }); // addToSet — never store the same token twice
}

async function removeToken({ userId, token }) {
  await userModel.updateOne({ _id: userId }, { $pull: { fcmTokens: token } });
}

// Called when FCM itself reports a token as dead (uninstalled app, expired, etc).
async function removeTokenGlobally(token) {
  await userModel.updateMany({ fcmTokens: token }, { $pull: { fcmTokens: token } });
}

module.exports = { registerToken, removeToken, removeTokenGlobally };