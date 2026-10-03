const { default: mongoose } = require("mongoose");

const responseConstants = {
  success: (res, message, data = null, status = 200) => {
    return res.status(status).json({
      status: true,
      message,
      data
    });
  },
  error: (res, message = "internal server error", status = 500) => {
    return res.status(status).json({
      status: false,
      message,

    });
  },
  // 401 (not authenticated) by default; also used with 403 by older call
  // sites. Same envelope as every other response.
  unauthorized: (res, message = "Authentication required", status = 401) => {
    return res.status(status).json({
      status: false,
      message,
      data: null
    });
  },
  BadRequest: (res, message, data = null, status = 400) => {
    return res.status(status).json({
      status: false,
      message,
      data
    });
  },
  mongooseObjectIdError: (id, response,name,data = null) => {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return response.status(200).json({
        status: false,
        message: `${name} is Invalid MongodbId. It must be a valid MongoDB ObjectId.`,
        data

      });
    }
    return null;
  },
  Forbidden: (res, message = "You do not have permission to perform this action", data = null, status = 403) => {
    return res.status(status).json({
      status: false,
      message,
      data
    });
  },
  validatIonError:(res,error,data=null) => {
    if (error) {
      return res.status(400).json({
        status: false,
        message:error?.details[0]?.message.replace(/"/g, ''),
        data
      });
    }
    return null;
  }
};

module.exports = responseConstants;
