const mongoose = require('mongoose');
const businessTypeModel = require('../../model/businessType.model');
const storeProfileModel = require('../../model/storeProfile.model');
const deleteConstants = require('../../constants/delete.constants');
const { createAuditLogAdmin } = require('../../helper/audit.helper');
const auditLogConstants = require('../../constants/auditLogConstants');

class BusinessTypeError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'BusinessTypeError';
    this.statusCode = statusCode;
  }
}

async function create({ adminId, body, req }) {
  const existing = await businessTypeModel.findOne({ slug: body.slug, is_deleted: deleteConstants.NOT_DELETED });
  if (existing) throw new BusinessTypeError('A business type with this slug already exists', 409);

  const type = await businessTypeModel.create({ ...body });
  await createAuditLogAdmin({ req, adminId, action: auditLogConstants.BUSINESS_TYPE_CREATED, entity: 'business_types', entityId: type._id });
  return type;
}

async function update({ adminId, typeId, body, req }) {
  if (!mongoose.Types.ObjectId.isValid(typeId)) throw new BusinessTypeError('Invalid business type id');
  const type = await businessTypeModel.findOne({ _id: typeId, is_deleted: deleteConstants.NOT_DELETED });
  if (!type) throw new BusinessTypeError('Business type not found', 404);

  if (body.slug && body.slug !== type.slug) {
    const clash = await businessTypeModel.findOne({ slug: body.slug, _id: { $ne: typeId }, is_deleted: deleteConstants.NOT_DELETED });
    if (clash) throw new BusinessTypeError('A business type with this slug already exists', 409);
  }

  Object.assign(type, body);
  await type.save();
  await createAuditLogAdmin({ req, adminId, action: auditLogConstants.BUSINESS_TYPE_UPDATED, entity: 'business_types', entityId: type._id });
  return type;
}

async function remove({ adminId, typeId, req }) {
  if (!mongoose.Types.ObjectId.isValid(typeId)) throw new BusinessTypeError('Invalid business type id');
  const inUse = await storeProfileModel.countDocuments({
    businessType: typeId,
    is_deleted: deleteConstants.NOT_DELETED,
  });
  if (inUse > 0) throw new BusinessTypeError('Cannot delete a business type that is in use by existing stores — disable it instead', 409);

  const type = await businessTypeModel.findOneAndUpdate(
    { _id: typeId, is_deleted: deleteConstants.NOT_DELETED },
    { is_deleted: deleteConstants.DELETED },
    { new: true }
  );
  if (!type) throw new BusinessTypeError('Business type not found', 404);
  await createAuditLogAdmin({ req, adminId, action: auditLogConstants.BUSINESS_TYPE_DELETED, entity: 'business_types', entityId: type._id });
  return { deleted: true };
}

async function list({ page = 1, limit = 200, status }) {
  const query = { is_deleted: deleteConstants.NOT_DELETED };
  if (status) query.status = status;
  const pageNum = Math.max(1, Number(page) || 1);
  const pageLimit = Math.min(500, Number(limit) || 200);
  const [getData, count] = await Promise.all([
    businessTypeModel.find(query).sort({ sortOrder: 1, name: 1 }).skip((pageNum - 1) * pageLimit).limit(pageLimit).lean(),
    businessTypeModel.countDocuments(query),
  ]);
  return { getData, count, page: pageNum, limit: pageLimit };
}

module.exports = { BusinessTypeError, create, update, remove, list };
