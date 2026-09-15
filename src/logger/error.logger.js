const { createLogger, format, transports } = require("winston");
const loggerInfo = createLogger({
  level: "error",
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  transports: [
    new transports.File({ filename: "logs/error.log", level: "error" }),
    new transports.File({ filename: "logs/combined.log" })
  ]
});

module.exports = loggerInfo;
