/**
 * AppError — the ONLY error type whose `.message` is safe to send to a
 * client. Throw this (or a subclass) for expected, handled failure cases
 * ("token not found", "not authorized", "invalid input", etc).
 *
 * Anything else that reaches the global error handler — a TypeError from
 * a null/undefined access, a driver error, a third-party SDK throwing its
 * own Error — is treated as an unexpected/internal error and its message
 * is never forwarded to the client, regardless of environment. This is
 * what closes the class of bug behind N-03 (internal error / stack
 * disclosure on verification & reset endpoints): that bug happened
 * because a plain, unmarked runtime error was allowed to flow to the
 * response unchanged.
 *
 * Usage:
 *   throw new AppError("Reset link is invalid or has expired.", 400);
 *   throw new AppError("Not authorized.", 403, "FORBIDDEN");
 *
 * `errorCode` is optional, machine-readable, and safe to expose (used by
 * clients to branch on specific cases without string-matching messages).
 */
class AppError extends Error {
  constructor(message, statusCode = 500, errorCode = undefined, details = undefined) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    // Marks this as a "known, handled" error as opposed to a bug/crash.
    this.isOperational = true;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

class BadRequestError extends AppError {
  constructor(message = "Bad request", errorCode = "BAD_REQUEST", details = undefined) {
    super(message, 400, errorCode, details);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized", errorCode = "UNAUTHORIZED", details = undefined) {
    super(message, 401, errorCode, details);
  }
}

class ForbiddenError extends AppError {
  constructor(message = "Forbidden", errorCode = "FORBIDDEN", details = undefined) {
    super(message, 403, errorCode, details);
  }
}

class NotFoundError extends AppError {
  constructor(message = "Not found", errorCode = "NOT_FOUND", details = undefined) {
    super(message, 404, errorCode, details);
  }
}

module.exports = {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
};
