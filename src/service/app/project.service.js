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

async function getOne({ projectId, buyerId }) {
  if (!mongoose.Types.ObjectId.isValid(projectId)) throw new ProjectError('Invalid project id', 404);
  const project = await projectModel.findOne({ _id: projectId, buyer: buyerId, is_deleted: deleteConstants.NOT_DELETED }).lean();
  if (!project) throw new ProjectError('Project not found', 404);
  return project;
}

async function markMaterialSourced({ projectId, buyerId, count = 1 }) {
  const project = await projectModel.findOne({ _id: projectId, buyer: buyerId, is_deleted: deleteConstants.NOT_DELETED });
  if (!project) throw new ProjectError('Project not found', 404);
  project.materialsSourced = Math.min(project.materialsRequired || Infinity, project.materialsSourced + Number(count));
  if (project.materialsRequired && project.materialsSourced >= project.materialsRequired) project.status = PROJECT_STATES.COMPLETED;
  await project.save();
  return project;
}

module.exports = { ProjectError, createProject, myProjects, getOne, markMaterialSourced };