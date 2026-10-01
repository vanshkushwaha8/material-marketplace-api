const businessTypeModel = require('../../model/businessType.model');
const deleteConstants = require('../../constants/delete.constants');
const cache = require('../../helper/cache.helper');

// Public, read-only — the registration form and seller Store Profile page
// fetch this to populate the "Business Type" dropdown dynamically instead
// of a hardcoded list. Management lives in the admin-side service.
// Cached (shared, 1h) — invalidated by the admin business-type screens.
async function list() {
  return cache.getOrSet(cache.NAMESPACES.BUSINESS_TYPES, 'active', 60 * 60, () => businessTypeModel
    .find({ status: 'active', is_deleted: deleteConstants.NOT_DELETED })
    .sort({ sortOrder: 1, name: 1 })
    .lean());
}

module.exports = { list };
