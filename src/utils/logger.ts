import winston from "winston";

// 敏感欄位清單
const sensitiveFields: string[] = ["CardNo", "CardCVC", "PAYUNI_HASH_KEY", "PAYUNI_HASH_IV", "password", "token", "secret", "key", "encryptInfo", "hashinfo", "EncryptInfo", "HashInfo"];

// 遞迴過濾敏感資訊
function sanitizeLog(data: any): any {
  if (typeof data !== "object" || data === null) return data;

  const sanitized: any = Array.isArray(data) ? [] : {};

  for (const key in data) {
    if (sensitiveFields.some((field) => key.toLowerCase().includes(field.toLowerCase()))) {
      sanitized[key] = "***REDACTED***";
    } else if (typeof data[key] === "object") {
      sanitized[key] = sanitizeLog(data[key]);
    } else {
      sanitized[key] = data[key];
    }
  }

  return sanitized;
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format((info) => {
      // 過濾敏感資訊
      if (info.message) info.message = sanitizeLog(info.message);
      // 過濾其他欄位
      Object.keys(info).forEach((key) => {
        if (!["level", "message", "timestamp", "service"].includes(key)) {
          info[key] = sanitizeLog(info[key]);
        }
      });
      return info;
    })(),
    winston.format.json()
  ),
  defaultMeta: { service: "payuni-backend" },
  transports: [
    new winston.transports.File({ filename: "logs/error.log", level: "error" }),
    new winston.transports.File({ filename: "logs/combined.log" }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp, ...meta }) => {
          return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length > 0 ? JSON.stringify(meta, null, 2) : ""}`;
        })
      ),
    }),
  ],
});

export default logger;
