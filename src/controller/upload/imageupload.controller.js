const imageService=require("../../service/upload/image.service")
const imageValidation = require("../../validation/upload/image.validation")
const statusCodes=require("../../constants/httpConstants")
const messageConstants = require("../../constants/message.constants");
const responseConstants = require("../../constants/response.constatnts");
const logger = require("../../logger/error.logger");
class imageUploadController {
    singleImage = async (request, response) => {
        try {
            if(!request.files || !request.files.tempImage){
                return responseConstants.BadRequest(response, messageConstants.UPLOAD.NO_UPLOAD, null, statusCodes.OK);
            }
            if (Array.isArray(request.files.tempImage)) {
                return responseConstants.BadRequest(response, messageConstants.UPLOAD.SINGLE_IMAGE, null, statusCodes.OK);
            }
            const { error } = await imageValidation.validateImage(request.files);
            const validationError = responseConstants.validatIonError(response, error);
            if (validationError) return;
            const imageData=await imageService.singleImage(request)
            return responseConstants.success(response, messageConstants.UPLOAD.IMAGE_UPLOAD, imageData, statusCodes.OK);

        } catch (error) {
            logger.error(`Error in single upload: ${error.message}`, { message: error.message, stack: error.stack });
            return responseConstants.error(response, error.message, statusCodes.INTERNAL_SERVER_ERROR);

        }
    }
    mulitpleImage=async(request,response)=>{
        try {
            if(!request.files || !request.files.tempImage || request.files.tempImage.length==0){
                return responseConstants.BadRequest(response, messageConstants.UPLOAD.NO_UPLOAD, null, statusCodes.OK);
            }
            let images = Array.isArray(request.files.tempImage) 
            ? request.files.tempImage 
            : [request.files.tempImage];
            const { error } = await imageValidation.validateMultiImage({ tempImage: images });
            const validationError = responseConstants.validatIonError(response, error);
            if (validationError) return;
            const imageData=await imageService.multiImage(request)
            return responseConstants.success(response, messageConstants.UPLOAD.IMAGE_UPLOAD, imageData, statusCodes.OK);
        } catch (error) {
            logger.error(`Error in multimage upload: ${error.message}`, { message: error.message, stack: error.stack });
            return responseConstants.error(response, error.message, statusCodes.INTERNAL_SERVER_ERROR);
            
        }
    }
}
module.exports = new imageUploadController()