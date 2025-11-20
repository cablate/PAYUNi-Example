import express from "express";
import session from "express-session";
import { OAuth2Client } from "google-auth-library";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

import products from "./src/data/products.js";
import logger from "./src/utils/logger.js";
import { printEnvironmentConfig, printError, printStartupBanner, printSuccess, printWarning } from "./src/utils/startup.js";

import { GOOGLE_CONFIG, REQUIRED_ENV_VARS, SERVER_CONFIG, SESSION_CONFIG } from "./src/config/constants.js";

import {
    configureCors,
    configureCsrfProtection,
    configureHelmet,
    configureRequestLogger,
    createGeneralLimiter,
    createPaymentLimiter,
} from "./src/middleware/security.js";

import { errorHandler } from "./src/middleware/errorHandler.js";
import { createAuthRoutes } from "./src/routes/auth.js";
import { createOrderRoutes } from "./src/routes/orders.js";
import { createPaymentRoutes } from "./src/routes/payment.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ========================================
// 環境檢查
// ========================================

printStartupBanner();

const missingEnvVars = REQUIRED_ENV_VARS.filter((envVar) => !process.env[envVar]);
printEnvironmentConfig(process.env);

if (missingEnvVars.length > 0) {
  printError(`缺少以下必要的環境變數: ${missingEnvVars.join(", ")}`);
  process.exit(1);
}

if (!process.env.PAYUNI_API_URL.includes("sandbox")) {
  printWarning("PAYUNI_API_URL 不是沙箱環境！請確認您是否要使用正式環境。");
}

// ========================================
// 應用初始化
// ========================================

const app = express();
const port = SERVER_CONFIG.PORT;

if (SERVER_CONFIG.NODE_ENV === "production") {
  app.set("trust proxy", 1);
  logger.info("Production mode: trust proxy enabled");
}

// ========================================
// 安全設定
// ========================================

configureHelmet(app);
configureCors(app);

const generalLimiter = createGeneralLimiter();
const paymentLimiter = createPaymentLimiter();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 靜態檔案（優先於速率限制）
app.use(express.static(path.join(__dirname, "_frontend")));
app.use(express.static(path.join(__dirname, "_frontend", "public")));

app.use(generalLimiter);

// Session 配置
app.use(
  session({
    secret: SESSION_CONFIG.SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: SERVER_CONFIG.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      maxAge: SESSION_CONFIG.COOKIE_MAX_AGE,
    },
    name: SESSION_CONFIG.COOKIE_NAME,
    proxy: SERVER_CONFIG.NODE_ENV === "production",
  })
);

// CSRF 防護
const csrfProtection = configureCsrfProtection(app);

// 請求日誌
configureRequestLogger(app);

// ========================================
// 一次性權杖存儲
// ========================================

const oneTimeTokens = new Map();

// ========================================
// 路由掛載
// ========================================

// Google OAuth 初始化
const oauth2Client = new OAuth2Client(GOOGLE_CONFIG.CLIENT_ID, GOOGLE_CONFIG.CLIENT_SECRET, GOOGLE_CONFIG.REDIRECT_URI);

// Auth 路由
app.use(createAuthRoutes(oauth2Client));

// Payment 路由
app.use(createPaymentRoutes(paymentLimiter, oneTimeTokens, products));

// Order 路由
app.use(createOrderRoutes(oneTimeTokens));

// ========================================
// 通用 API 端點
// ========================================

/**
 * 前端配置 API
 */
app.get("/api/client-config", (req, res) => {
  res.json({
    turnstileEnable: process.env.TURNSTILE_ENABLE === "true",
  });
});

/**
 * CSRF Token API
 */
app.get("/csrf-token", csrfProtection, (req, res) => {
  try {
    const token = req.csrfToken();
    res.json({ csrfToken: token });
  } catch (error) {
    logger.error("Failed to generate CSRF token", { error: error.message });
    res.status(500).json({ error: "Failed to generate CSRF token" });
  }
});

/**
 * 商品列表 API
 */
app.get("/api/products", (req, res) => {
  res.json(products);
});

// ========================================
// 錯誤處理
// ========================================

/**
 * 全域錯誤處理 - 使用自定義錯誤處理中間件
 */
app.use(errorHandler);

/**
 * 未捕捉的例外
 */
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", {
    message: error.message,
  });
  process.exit(1);
});

/**
 * 未處理的 Promise 拒絕
 */
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled rejection", {
    reason: String(reason),
  });
});

// ========================================
// 伺服器啟動
// ========================================

const server = app.listen(port, () => {
  logger.info(`Backend server listening at http://localhost:${port}`);
  printSuccess(port);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    logger.error(`Port ${port} is already in use`);
  } else {
    logger.error("Server error", {
      message: error.message,
      stack: error.stack,
    });
  }
  process.exit(1);
});
