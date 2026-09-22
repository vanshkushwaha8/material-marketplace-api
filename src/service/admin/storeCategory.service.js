const mongoose = require('mongoose');
const storeCategoryModel = require('../../model/storeCategory.model');
const storeProfileModel = require('../../model/storeProfile.model');
const deleteConstants = require('../../constants/delete.constants');
const { createAuditLogAdmin } = require('../../helper/audit.helper');
const auditLogConstants = require('../../constants/auditLogConstants');

class StoreCategoryError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'StoreCategoryError';
    this.statusCode = statusCode;
  }
}

async function create({ adminId, body, req }) {
  const existing = await storeCategoryModel.findOne({ slug: body.slug, is_deleted: deleteConstants.NOT_DELETED });
  if (existing) throw new StoreCategoryError('A store category with this slug already exists', 409);

  const category = await storeCategoryModel.create({ ...body });
  await createAuditLogAdmin({ req, adminId, action: auditLogConstants.STORE_CATEGORY_CREATED, entity: 'store_categories', entityId: category._id });
  return category;
}

async function update({ adminId, categoryId, body, req }) {
  if (!mongoose.Types.ObjectId.isValid(categoryId)) throw new StoreCategoryError('Invalid category id');
  const category = await storeCategoryModel.findOne({ _id: categoryId, is_deleted: deleteConstants.NOT_DELETED });
  if (!category) throw new StoreCategoryError('Store category not found', 404);

  if (body.slug && body.slug !== category.slug) {
    const clash = await storeCategoryModel.findOne({ slug: body.slug, _id: { $ne: categoryId }, is_deleted: deleteConstants.NOT_DELETED });
    if (clash) throw new StoreCategoryError('A store category with this slug already exists', 409);
  }

  Object.assign(category, body);
  await category.save();
  await createAuditLogAdmin({ req, adminId, action: auditLogConstants.STORE_CATEGORY_UPDATED, entity: 'store_categories', entityId: category._id });
  return category;
}

async function remove({ adminId, categoryId, req }) {
  if (!mongoose.Types.ObjectId.isValid(categoryId)) throw new StoreCategoryError('Invalid category id');
  const inUse = await storeProfileModel.countDocuments({
    categoryIds: categoryId,
    is_deleted: deleteConstants.NOT_DELETED,
  });
  if (inUse > 0) throw new StoreCategoryError('Cannot delete a category that is in use by existing stores — disable it instead', 409);

  const category = await storeCategoryModel.findOneAndUpdate(
    { _id: categoryId, is_deleted: deleteConstants.NOT_DELETED },
    { is_deleted: deleteConstants.DELETED },
    { new: true }
  );
  if (!category) throw new StoreCategoryError('Store category not found', 404);
  await createAuditLogAdmin({ req, adminId, action: auditLogConstants.STORE_CATEGORY_DELETED, entity: 'store_categories', entityId: category._id });
  return { deleted: true };
}

async function list({ page = 1, limit = 200, status }) {
  const query = { is_deleted: deleteConstants.NOT_DELETED };
  if (status) query.status = status;
  const pageNum = Math.max(1, Number(page) || 1);
  const pageLimit = Math.min(500, Number(limit) || 200);
  const [getData, count] = await Promise.all([
    storeCategoryModel.find(query).sort({ sortOrder: 1, name: 1 }).skip((pageNum - 1) * pageLimit).limit(pageLimit).lean(),
    storeCategoryModel.countDocuments(query),
  ]);
  return { getData, count, page: pageNum, limit: pageLimit };
}

module.exports = { StoreCategoryError, create, update, remove, list };
