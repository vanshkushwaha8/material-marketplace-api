// Marketplace roles (users.userType). Authorization for each role lives in
// constants/rbac.constants.js (USER_ROLE_PERMISSIONS). Seller sub-types
// (INDIVIDUAL / BUSINESS_STORE) are an attribute, not a role — see
// sellerType.constants.js.
const userTypeConstants = Object.freeze({
    Buyer: "Buyer",
    Seller: "Seller",
});
module.exports = userTypeConstants;
