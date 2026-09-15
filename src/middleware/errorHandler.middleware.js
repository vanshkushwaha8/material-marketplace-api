const responseConstants = require("../constants/response.constatnts");
const configenv = require("../config/env.config");
const statusCodes = require("../constants/httpConstants");
const logger = require("../logger/error.logger");
const { AppError } = require("../utils/AppError");
const SENSITIVE_PARAM_NAMES = [
  "token",
  "password",
  "newpassword",
  "oldpassword",
  "otp",
  "secret",
  "code",
  "authorization",
];
function redactUrl(originalUrl = "") {
  const [pathPart, queryPart] = originalUrl.split("?");
  if (!queryPart) return originalUrl;
  try {
    const params = new URLSearchParams(queryPart);
    for (const key of params.keys()) {
      if (SENSITIVE_PARAM_NAMES.includes(key.toLowerCase())) {
        params.set(key, "[REDACTED]");
      }
    }
    return `${pathPart}?${params.toString()}`;
  } catch {
    return pathPart;
  }
}

const errorHandler = (error, request, response, next) => {
  const requestId = request.id || undefined;

  logger.error(error.message || "Internal server error", {
    requestId,
    stack: error.stack,
    url: redactUrl(request.originalUrl),
    method: request.method,
    ip: request.ip,
    userId: request.user?.id || request.admin?.id || null,
  });

  if (error.message === "Not allowed by CORS") {
    return responseConstants.Forbidden(response, "Origin not allowed.");
  }
  const statusCode = error.statusCode || statusCodes.INTERNAL_SERVER_ERROR;
  const isKnownOperationalError =
    error instanceof AppError ||
    error.isOperational === true ||
    (typeof error.statusCode === "number" && error.statusCode !== statusCodes.INTERNAL_SERVER_ERROR);

  let message = "Internal server error";
  if (isKnownOperationalError) {
    message = error.message || message;
  } else if (configenv.SHOW_ERROR_DETAILS) {
    message = error.message || message;
  }
  const body = { message };
  if (requestId) body.errorId = requestId;
  if (isKnownOperationalError && error.errorCode) body.code = error.errorCode;
  if (isKnownOperationalError && error.details) body.data = error.details;

  return response.status(statusCode).json({ status: false, ...body });
};

module.exports = errorHandler;
