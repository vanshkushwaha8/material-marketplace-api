const responseConstants = require('../../constants/response.constatnts');
const statusCodes = require('../../constants/httpConstants');
const projectService = require('../../service/app/project.service');
const projectValidation = require('../../validation/app/project.validation');

class ProjectController {
  create = async (request, response, nextFunction) => {
    try {
      const { error, value } = projectValidation.ValidateCreate(request.body);
      const validationError = responseConstants.validatIonError(response, error);
      if (validationError) return;
      const project = await projectService.createProject({ buyerId: request.auth._id, body: value });
      return responseConstants.success(response, 'Project created', project, statusCodes.CREATED);
    } catch (error) { nextFunction(error); }
  };

  myProjects = async (request, response, nextFunction) => {
    try {
      const result = await projectService.myProjects({ buyerId: request.auth._id, page: request.query.page, limit: request.query.limit });
      return responseConstants.success(response, 'Projects fetched', result, statusCodes.OK);
    } catch (error) { nextFunction(error); }
  };

  getOne = async (request, response, nextFunction) => {
    try {
      const project = await projectService.getOne({ projectId: request.params.id, buyerId: request.auth._id });
      return responseConstants.success(response, 'Project fetched', project, statusCodes.OK);
    } catch (error) {
      if (error instanceof projectService.ProjectError) return responseConstants.BadRequest(response, error.message, null, error.statusCode);
      nextFunction(error);
    }
  };
}
module.exports = new ProjectController();