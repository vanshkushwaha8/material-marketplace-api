const { OAuth2Client } = require('google-auth-library');
const configenv = require('../../config/env.config');
const userModel = require('../../model/user.model');
const deleteConstants = require('../../constants/delete.constants');
const userTypeConstants = require('../../constants/usertype.constants');
const { SELLER_TYPES } = require('../../constants/sellerType.constants');
const { createAuditLog } = require('../../helper/audit.helper');
const auditLogConstants = require('../../constants/auditLogConstants');

class GoogleAuthError extends Error {
  constructor(message, statusCode = 400, errorCode = null) { super(message); this.name = 'GoogleAuthError'; this.statusCode = statusCode; this.errorCode = errorCode; }
}

let client = null;
const getClient = () => {
  if (!configenv.GOOGLE_CLIENT_ID) throw new GoogleAuthError('Google sign-in is not configured on this server', 503, 'GOOGLE_NOT_CONFIGURED');
  if (!client) client = new OAuth2Client(configenv.GOOGLE_CLIENT_ID);
  return client;
};

/**
 * Verify a Google ID token (from Google Identity Services on the frontend).
 * Checks signature, expiry, issuer and that it was issued for OUR client id.
 */
async function verifyIdToken(idToken) {
  let ticket;
  try {
    ticket = await getClient().verifyIdToken({ idToken, audience: configenv.GOOGLE_CLIENT_ID });
  } catch (err) {
    if (err instanceof GoogleAuthError) throw err;
    throw new GoogleAuthError('Google sign-in could not be verified. Please try again.', 401, 'GOOGLE_TOKEN_INVALID');
  }
  const p = ticket.getPayload() || {};
  if (!p.email || p.email_verified !== true) throw new GoogleAuthError('Your Google account email is not verified', 401, 'GOOGLE_EMAIL_UNVERIFIED');
  return { sub: p.sub, email: String(p.email).trim().toLowerCase(), name: p.name || p.given_name || '' };
}

/**
 * Resolve the marketplace user for a verified Google identity.
 *
 *  - Existing account (by Google sub, else by verified email) → that user;
 *    the Google sub is linked on first use. Email-verified is set, since
 *    Google proved ownership of the address.
 *  - No account and no role chosen → { needUserType: true } (the UI asks).
 *  - No account + role → a new Buyer or INDIVIDUAL Seller. Business stores
 *    need business/store details, so they must use the full sign-up form.
 *
 * Login completion (suspension, 2FA, consent, session) is shared with the
 * password login via authService.completeLogin.
 */
async function resolveUser({ idToken, userType, req }) {
  const g = await verifyIdToken(idToken);
  let user = await userModel.findOne({ googleSub: g.sub, is_deleted: deleteConstants.NOT_DELETED })
    || await userModel.findOne({ email: g.email, is_deleted: deleteConstants.NOT_DELETED });

  if (user) {
    if (user.userType === 'ComplianceOfficer') throw new GoogleAuthError('This account cannot sign in here', 403);
    if (user.googleSub && user.googleSub !== g.sub) throw new GoogleAuthError('This email is linked to a different Google account', 409);
    const updates = {};
    if (!user.googleSub) updates.googleSub = g.sub;
    if (!user.isEmailVerified) updates.isEmailVerified = true;
    if (Object.keys(updates).length) {
      await userModel.updateOne({ _id: user._id }, { $set: updates });
      Object.assign(user, updates);
    }
    return { user, created: false };
  }

  if (!userType) return { needUserType: true, email: g.email, name: g.name };
  if (![userTypeConstants.Buyer, userTypeConstants.Seller].includes(userType)) throw new GoogleAuthError('Choose Buyer or Seller');

  try {
    user = await userModel.create({
      email: g.email, fullName: g.name, userType,
      sellerType: userType === userTypeConstants.Seller ? SELLER_TYPES.INDIVIDUAL : null,
      googleSub: g.sub, isEmailVerified: true,
    });
  } catch (err) {
    if (err.code === 11000) return resolveUser({ idToken, userType, req }); // concurrent first sign-in
    throw err;
  }
  await createAuditLog({ req, userId: user._id, action: auditLogConstants.REGISTER, entity: 'users', entityId: user._id, metadata: { via: 'google', userType } });
  return { user, created: true };
}

module.exports = { GoogleAuthError, verifyIdToken, resolveUser };
