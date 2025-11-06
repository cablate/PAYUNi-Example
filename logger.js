const winston = require("winston");

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }), winston.format.errors({ stack: true }), winston.format.splat(), winston.format.json()),
  defaultMeta: { service: "payuni-backend" },
  transports: [
    // 錯誤日誌
    new winston.transports.File({ filename: "logs/error.log", level: "error" }),
    // 所有日誌
    new winston.transports.File({ filename: "logs/combined.log" }),
    // 開發環境在控制台輸出
    ...(process.env.NODE_ENV !== "production"
      ? [
          new winston.transports.Console({
            format: winston.format.combine(
              winston.format.colorize(),
              winston.format.printf(({ level, message, timestamp, ...meta }) => {
                return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length > 0 ? JSON.stringify(meta, null, 2) : ""}`;
              })
            ),
          }),
        ]
      : []),
  ],
});

module.exports = logger;
