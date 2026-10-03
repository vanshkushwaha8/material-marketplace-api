const mongoose = require('mongoose');
const projectModel = require('../../model/project.model');
const deleteConstants = require('../../constants/delete.constants');
const { PROJECT_STATES } = require('../../constants/project.constants');

class ProjectError extends Error {
  constructor(message, statusCode = 400) { super(message); this.name = 'ProjectError'; this.statusCode = statusCode; }
}

async function createProject({ buyerId, body }) {
  return projectModel.create({ buyer: buyerId, ...body });
}

async function myProjects({ buyerId, page = 1, limit = 20 }) {
  const query = { buyer: buyerId, is_deleted: deleteConstants.NOT_DELETED };
  const pageNum = Math.max(1, Number(page) || 1);
  const pageLimit = Math.min(100, Number(limit) || 20);
  const [getData, count] = await Promise.all([
    projectModel.find(query).sort({ createdAt: -1 }).skip((pageNum - 1) * pageLimit).limit(pageLimit).lean(),
    projectModel.countDocuments(query),
  ]);
  return { getData, count, page: pageNum, limit: pageLimit };
}

// Ownership: a project is only ever found through its buyer — anyone
// else's id is "not found".
async function findOwned(projectId, buyerId) {
  if (!mongoose.Types.ObjectId.isValid(projectId)) throw new ProjectError('Project not found', 404);
  const project = await projectModel.findOne({ _id: projectId, buyer: buyerId, is_deleted: deleteConstants.NOT_DELETED });
  if (!project) throw new ProjectError('Project not found', 404);
  return project;
}

// Detail + the orders and offers the buyer linked to this project.
async function getOne({ projectId, buyerId }) {
  const project = (await findOwned(projectId, buyerId)).toObject();
  const transactionModel = require('../../model/transaction.model');
  const offerModel = require('../../model/offer.model');
  const [orders, offers] = await Promise.all([
    transactionModel.find({ project: project._id, buyer: buyerId, is_deleted: deleteConstants.NOT_DELETED })
      .select('listing status agreedAmount agreedQuantity createdAt').populate('listing', 'title unit').sort({ createdAt: -1 }).limit(50).lean(),
    offerModel.find({ project: project._id, buyer: buyerId, is_deleted: deleteConstants.NOT_DELETED })
      .select('listing status currentAmount quantity createdAt').populate('listing', 'title unit').sort({ createdAt: -1 }).limit(50).lean(),
  ]);
  return { ...project, orders, offers };
}

async function updateProject({ projectId, buyerId, body }) {
  const project = await findOwned(projectId, buyerId);
  Object.assign(project, body);
  if (body.materialsRequired !== undefined && project.materialsSourced > project.materialsRequired && project.materialsRequired > 0) {
    project.materialsSourced = project.materialsRequired;
  }
  await project.save();
  return project;
}

// Soft delete. Refused while an order linked to it is still in progress,
// so an in-flight purchase never loses its project.
async function deleteProject({ projectId, buyerId }) {
  const project = await findOwned(projectId, buyerId);
  const transactionModel = require('../../model/transaction.model');
  const { TRANSACTION_TERMINAL_STATES } = require('../../constants/transaction.constants');
  const open = await transactionModel.countDocuments({ project: project._id, status: { $nin: TRANSACTION_TERMINAL_STATES }, is_deleted: deleteConstants.NOT_DELETED });
  if (open) throw new ProjectError(`This project has ${open} order${open === 1 ? '' : 's'} in progress — finish ${open === 1 ? 'it' : 'them'} first`, 409);
  project.is_deleted = deleteConstants.DELETED;
  await project.save();
}

async function markMaterialSourced({ projectId, buyerId, count = 1 }) {
  const project = await projectModel.findOne({ _id: projectId, buyer: buyerId, is_deleted: deleteConstants.NOT_DELETED });
  if (!project) throw new ProjectError('Project not found', 404);
  project.materialsSourced = Math.min(project.materialsRequired || Infinity, project.materialsSourced + Number(count));
  if (project.materialsRequired && project.materialsSourced >= project.materialsRequired) project.status = PROJECT_STATES.COMPLETED;
  await project.save();
  return project;
}

module.exports = { ProjectError, createProject, myProjects, getOne, updateProject, deleteProject, markMaterialSourced };