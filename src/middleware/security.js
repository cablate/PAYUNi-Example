import cors from "cors";
import csrf from "csurf";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { CORS_ALLOWED_ORIGINS, CSRF_EXCLUDED_PATHS, RATE_LIMIT_CONFIG } from "../config/constants.js";
import logger from "../utils/logger.js";

/**
 * 配置 Helmet 安全標頭
 */
export function configureHelmet(app) {
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "https://challenges.cloudflare.com", "https://accounts.google.com/gsi/client"],
          styleSrc: ["'self'", "https://challenges.cloudflare.com"],
          frameSrc: ["https://challenges.cloudflare.com", "https://accounts.google.com/gsi/"],
          connectSrc: ["'self'", "https://challenges.cloudflare.com", process.env.DOMAIN],
          imgSrc: ["'self'", "https://challenges.cloudflare.com", "data:", "https://lh3.googleusercontent.com", "https://developers.google.com"],
          fontSrc: ["'self'", "data:"],
          objectSrc: ["'none'"],
          formAction: ["'self'", "https://sandbox-api.payuni.com.tw", "https://api.payuni.com.tw"],
          frameAncestors: ["'self'"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    })
  );
}

/**
 * 配置 CORS
 */
export function configureCors(app) {
  const corsOptions = {
    origin: function (origin, callback) {
      if (
        !origin ||
        origin === "null" ||
        CORS_ALLOWED_ORIGINS.some((allowed) => {
          return origin === allowed || origin === allowed.replace(/\/$/, "");
        })
      ) {
        callback(null, true);
      } else {
        logger.warn("CORS 請求被拒絕", { origin, allowedOrigins: CORS_ALLOWED_ORIGINS });
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST"],
    credentials: true,
    maxAge: 86400,
  };

  app.use(cors(corsOptions));
}

/**
 * 建立通用速率限制器
 */
export function createGeneralLimiter() {
  return rateLimit({
    windowMs: RATE_LIMIT_CONFIG.GENERAL.windowMs,
    max: RATE_LIMIT_CONFIG.GENERAL.max,
    message: RATE_LIMIT_CONFIG.GENERAL.message,
    standardHeaders: true,
    legacyHeaders: false,
  });
}

/**
 * 建立支付速率限制器
 */
export function createPaymentLimiter() {
  return rateLimit({
    windowMs: RATE_LIMIT_CONFIG.PAYMENT.windowMs,
    max: RATE_LIMIT_CONFIG.PAYMENT.max,
    message: RATE_LIMIT_CONFIG.PAYMENT.message,
    standardHeaders: true,
    legacyHeaders: false,
  });
}

/**
 * 建立 API 結果速率限制器
 */
export function createApiResultLimiter() {
  return rateLimit({
    windowMs: RATE_LIMIT_CONFIG.API_RESULT.windowMs,
    max: RATE_LIMIT_CONFIG.API_RESULT.max,
    message: RATE_LIMIT_CONFIG.API_RESULT.message,
    standardHeaders: true,
    legacyHeaders: false,
  });
}

/**
 * 配置 CSRF 防護
 */
export function configureCsrfProtection(app) {
  const csrfProtection = csrf({
    cookie: false,
  });

  // 全域套用 CSRF 保護 (GET, HEAD, OPTIONS 除外，並排除特定路徑)
  app.use((req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method) || CSRF_EXCLUDED_PATHS.includes(req.path)) {
      return next();
    }
    csrfProtection(req, res, next);
  });

  // CSRF 錯誤處理中間件
  const csrfErrorHandler = (err, req, res, next) => {
    if (err.code === "EBADCSRFTOKEN") {
      logger.warn("CSRF token 驗證失敗", {
        path: req.path,
        method: req.method,
        ip: req.ip,
      });
      return res.status(403).json({
        error: "安全驗證失敗，請重新整理頁面後重試",
        code: "CSRF_VALIDATION_FAILED",
      });
    }
    next(err);
  };

  app.use(csrfErrorHandler);

  return csrfProtection;
}

/**
 * 配置請求日誌中間件
 */
export function configureRequestLogger(app) {
  app.use((req, res, next) => {
    const startTime = Date.now();

    res.on("finish", () => {
      const duration = Date.now() - startTime;

      if (res.statusCode >= 400 || ["POST", "PUT", "DELETE"].includes(req.method)) {
        const logData = {
          method: req.method,
          path: req.path,
          status: res.statusCode,
          duration: `${duration}ms`,
        };

        if (res.statusCode >= 500) {
          logger.error(`伺服器錯誤：${req.method} ${req.path}`, logData);
        } else if (res.statusCode >= 400) {
          logger.warn(`客戶端錯誤：${req.method} ${req.path}`, logData);
        } else {
          logger.info(`請求成功：${req.method} ${req.path}`, logData);
        }
      }
    });

    next();
  });
}
