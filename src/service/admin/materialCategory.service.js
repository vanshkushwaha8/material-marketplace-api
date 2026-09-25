const mongoose = require('mongoose');
const materialCategoryModel = require('../../model/materialCategory.model');
const materialListingModel = require('../../model/materialListing.model');
const deleteConstants = require('../../constants/delete.constants');
const { createAuditLogAdmin } = require('../../helper/audit.helper');
const auditLogConstants = require('../../constants/auditLogConstants');
const fs = require('fs/promises');
const path = require('path');
const materialListingService = require('../../service/app/materialListing.service'); // adjust path

// Same shape as storeProfile.service.js#mediaUrl
function mediaUrl(filename) {
  return filename ? `/images/${filename}` : '';
}

// Same as storeProfile.service.js#removeStoredMedia (best-effort delete)
async function removeStoredMedia(filename) {
  try {
    await fs.unlink(path.join(__dirname, '../../../public', materialListingService.MEDIA_FOLDER, path.basename(filename)));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('Could not delete replaced category logo:', filename, err.message);
  }
}

function withLogoUrl(category) {
  const obj = typeof category.toObject === 'function' ? category.toObject() : category;
  return { ...obj, logoUrl: mediaUrl(obj.logo) };
}
class MaterialCategoryError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'MaterialCategoryError';
    this.statusCode = statusCode;
  }
}

async function create({ adminId, body, req }) {
  const existing = await materialCategoryModel.findOne({ slug: body.slug, is_deleted: deleteConstants.NOT_DELETED });
  if (existing) throw new MaterialCategoryError('A category with this slug already exists', 409);

  if (body.logo) await materialListingService.finalizeSingleMedia(body.logo);   // <-- add

  const category = await materialCategoryModel.create({ ...body });
  await createAuditLogAdmin({ req, adminId, action: auditLogConstants.MATERIAL_CATEGORY_CREATED, entity: 'material_categories', entityId: category._id });
  return withLogoUrl(category);                                                  // <-- was: return category;
}

async function update({ adminId, categoryId, body, req }) {
  if (!mongoose.Types.ObjectId.isValid(categoryId)) throw new MaterialCategoryError('Invalid category id');
  const category = await materialCategoryModel.findOne({ _id: categoryId, is_deleted: deleteConstants.NOT_DELETED });
  if (!category) throw new MaterialCategoryError('Category not found', 404);

  if (body.slug && body.slug !== category.slug) {
    const clash = await materialCategoryModel.findOne({ slug: body.slug, _id: { $ne: categoryId }, is_deleted: deleteConstants.NOT_DELETED });
    if (clash) throw new MaterialCategoryError('A category with this slug already exists', 409);
  }
  let replacedLogo = null;
  if (body.logo !== undefined && body.logo !== category.logo) {
    if (body.logo) await materialListingService.finalizeSingleMedia(body.logo);
    if (category.logo) replacedLogo = category.logo;
  }

  Object.assign(category, body);
  await category.save();
  if (replacedLogo) await removeStoredMedia(replacedLogo); // delete only after save succeeds
  await createAuditLogAdmin({ req, adminId, action: auditLogConstants.MATERIAL_CATEGORY_UPDATED, entity: 'material_categories', entityId: category._id });
  return withLogoUrl(category);
}
async function remove({ adminId, categoryId, req }) {
  if (!mongoose.Types.ObjectId.isValid(categoryId)) throw new MaterialCategoryError('Invalid category id');
  const inUse = await materialListingModel.countDocuments({
    $or: [{ category: categoryId }, { subcategory: categoryId }],
    is_deleted: deleteConstants.NOT_DELETED,
  });
  if (inUse > 0) throw new MaterialCategoryError('Cannot delete a category that is in use by existing listings', 409);

  const category = await materialCategoryModel.findOneAndUpdate(
    { _id: categoryId, is_deleted: deleteConstants.NOT_DELETED },
    { is_deleted: deleteConstants.DELETED },
    { new: true }
  );
  if (!category) throw new MaterialCategoryError('Category not found', 404);
  await createAuditLogAdmin({ req, adminId, action: auditLogConstants.MATERIAL_CATEGORY_DELETED, entity: 'material_categories', entityId: category._id });
  return { deleted: true };
}

async function list({ page = 1, limit = 50, status }) {
  const query = { is_deleted: deleteConstants.NOT_DELETED };
  if (status) query.status = status;
  const pageNum = Math.max(1, Number(page) || 1);
  const pageLimit = Math.min(200, Number(limit) || 50);
  const [getData, count] = await Promise.all([
    materialCategoryModel.find(query).sort({ sortOrder: 1, name: 1 }).skip((pageNum - 1) * pageLimit).limit(pageLimit).lean(),
    materialCategoryModel.countDocuments(query),
  ]);
  return { getData: getData.map(withLogoUrl), count, page: pageNum, limit: pageLimit };
}

module.exports = { MaterialCategoryError, create, update, remove, list };
