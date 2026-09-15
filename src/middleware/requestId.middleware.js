const crypto = require("crypto");
const requestIdMiddleware = (request, response, next) => {
  const inbound = request.headers["x-request-id"];
  const id =
    typeof inbound === "string" && /^[a-zA-Z0-9-]{1,64}$/.test(inbound)
      ? inbound
      : crypto.randomUUID();

  request.id = id;
  response.setHeader("X-Request-Id", id);
  next();
};

module.exports = requestIdMiddleware;
