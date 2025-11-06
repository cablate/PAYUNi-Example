const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { encrypt, decrypt, sha256 } = require("./utils/crypto");
const cors = require("cors");
const querystring = require("querystring");
const rateLimit = require("express-rate-limit");
const { body, validationResult } = require("express-validator");
const helmet = require("helmet");
const session = require("express-session");
const csrf = require("csurf");
const logger = require("./utils/logger");
const { printStartupBanner, printEnvironmentConfig, printSuccess, printWarning, printError } = require("./startup");

require("dotenv").config();

// 印出啟動畫面
printStartupBanner();

// 檢查必要的環境變數
const requiredEnvVars = ["PAYUNI_API_URL", "PAYUNI_MERCHANT_ID", "PAYUNI_HASH_KEY", "PAYUNI_HASH_IV", "TURNSTILE_SECRET_KEY", "NOTIFY_URL", "GAS_WEBHOOK_URL"];

const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

// 印出環境變數配置
printEnvironmentConfig(process.env);

// 檢查是否有缺少的環境變數
if (missingEnvVars.length > 0) {
  printError(`缺少以下必要的環境變數: ${missingEnvVars.join(", ")}`);
  process.exit(1);
}

// 檢查沙箱環境
if (!process.env.PAYUNI_API_URL.includes("sandbox")) {
  printWarning("PAYUNI_API_URL 不是沙箱環境！請確認您是否要使用正式環境。");
}

const app = express();
const port = 80;

const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY;
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// ========================================
// 安全設定
// ========================================

// 1. Helmet 安全標頭設定
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // 移除 'unsafe-inline'，所有 script 與 style 必須來自明確的來源或以 nonce 方式加載
        scriptSrc: ["'self'", "https://challenges.cloudflare.com"],
        styleSrc: ["'self'", "https://challenges.cloudflare.com"],
        frameSrc: ["https://challenges.cloudflare.com"],
        connectSrc: ["'self'", "https://challenges.cloudflare.com", process.env.DOMAIN],
        // 限制 img-src 為自己站域、Cloudflare（Turnstile）以及允許 data: URI（小圖示）
        imgSrc: ["'self'", "https://challenges.cloudflare.com", "data:"],
        // 明確定義 font-src，避免使用廣泛的 https: 通配
        fontSrc: ["'self'", "data:"],
        // 限制 form-action 只允許提交到自己站域與 PAYUNi 官方端點
        formAction: ["'self'", "https://sandbox-api.payuni.com.tw", "https://api.payuni.com.tw"],
        // 防止被嵌入到其他網站中的 iframe（只允許自己的頁面嵌入自己）
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

// 2. CORS 白名單限制
const corsOptions = {
  origin: function (origin, callback) {
    // 構建允許的來源列表
    const allowedOrigins = [
      // 前端/返回 URL
      process.env.PAYUNI_RETURN_URL || "https://sandbox-api.payuni.com.tw",
      process.env.DOMAIN || "http://localhost",
      // 開發環境
      "http://localhost",
      "http://127.0.0.1",
      "http://localhost:3000",
      "http://localhost:5173", // Vite dev server
    ];

    // 允許以下情況：
    // 1. 沒有 origin（伺服器間通訊、curl、postman）
    // 2. origin 是 "null"（表單提交、某些跨域場景）
    // 3. origin 在白名單中
    if (
      !origin ||
      origin === "null" ||
      allowedOrigins.some((allowed) => {
        // 完全匹配或去掉尾部斜杠後匹配
        return origin === allowed || origin === allowed.replace(/\/$/, "");
      })
    ) {
      callback(null, true);
    } else {
      logger.warn("CORS blocked request", { origin, allowedOrigins });
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST"],
  credentials: true,
  maxAge: 86400,
};

app.use(cors(corsOptions));

// 3. Rate Limiting 配置
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分鐘
  max: 100, // 每個 IP 最多 100 個請求
  message: { error: "請求過於頻繁，請稍後再試" },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(generalLimiter); // 套用 Rate Limiting 到所有路由

const paymentLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 分鐘
  max: 5, // 每個 IP 最多 5 次支付請求
  message: { error: "支付請求過於頻繁，請稍後再試" },
  skipSuccessfulRequests: false,
});

// 4. PAYUNi ReturnURL 白名單驗證
const ALLOWED_RETURN_URLS = [process.env.PAYUNI_RETURN_URL || "http://localhost"];

app.use(express.json());
app.use(express.urlencoded({ extended: true })); // 支援 form-urlencoded 格式
// 提供靜態檔案：根目錄（index.html）與 public 子目錄
app.use(express.static(path.join(__dirname))); // 根目錄
app.use(express.static(path.join(__dirname, "public"))); // public 子目錄

// Session 配置（用於 CSRF 防護）
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your-secret-key-change-in-production",
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: process.env.NODE_ENV === "production", // 生產環境使用 HTTPS only
      httpOnly: true, // 防止 JavaScript 存取
      sameSite: "lax", // CSRF 防護
      maxAge: 1000 * 60 * 60 * 24, // 24 小時
    },
  })
);

// CSRF 防護中間件
// 支持在 header ('X-CSRF-Token') 或 body ('_csrf' 欄位) 中提交 token
const csrfProtection = csrf({
  cookie: false,
  value: (req) => {
    return req.headers["x-csrf-token"] || req.body._csrf;
  },
});

// 對所有非 GET 的請求應用 CSRF protection（除了特定端點）
const csrfErrorHandler = (err, req, res, next) => {
  if (err.code === "EBADCSRFTOKEN") {
    logger.warn("CSRF token validation failed", {
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
app.use(csrfErrorHandler); // 應用 CSRF 錯誤處理中間件

// 5. 安全錯誤處理工具函數
function sendSecureError(res, statusCode, publicMessage, logContext = {}) {
  logger.error(publicMessage, logContext);

  if (process.env.NODE_ENV === "production") {
    return res.status(statusCode).json({
      error: "系統處理異常，請稍後再試",
      code: statusCode,
    });
  }

  return res.status(statusCode).json({
    error: publicMessage,
    ...logContext,
  });
}

// 請求日誌 - 只記錄重要的
app.use((req, res, next) => {
  const startTime = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - startTime;

    // 記錄錯誤和修改類操作
    if (res.statusCode >= 400 || ["POST", "PUT", "DELETE"].includes(req.method)) {
      const logData = {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration: `${duration}ms`,
      };

      if (res.statusCode >= 500) {
        logger.error(`${req.method} ${req.path}`, logData);
      } else if (res.statusCode >= 400) {
        logger.warn(`${req.method} ${req.path}`, logData);
      } else {
        logger.info(`${req.method} ${req.path}`, logData);
      }
    }
  });

  next();
});

// ========================================
// 路由與業務邏輯
// ========================================

// CSRF Token 取得端點：使用 csrfProtection 中間件以初始化 token
app.get("/csrf-token", csrfProtection, (req, res) => {
  try {
    const token = req.csrfToken();
    res.json({ csrfToken: token });
  } catch (error) {
    logger.error("Failed to generate CSRF token", { error: error.message });
    res.status(500).json({ error: "Failed to generate CSRF token" });
  }
});

// 定義 /create-payment 的驗證規則
const createPaymentValidation = [
  body("email").trim().notEmpty().withMessage("Email 不可為空").isEmail().withMessage("Email 格式不正確").normalizeEmail().isLength({ max: 100 }).withMessage("Email 長度不可超過 100 字元"),

  body("turnstileToken")
    .if(() => process.env.TURNSTILE_ENABLE === "true")
    .notEmpty()
    .withMessage("驗證 token 不可為空")
    .isString()
    .withMessage("驗證 token 必須是字串")
    .isLength({ max: 2000 })
    .withMessage("Token 長度異常"),
];

app.post("/create-payment", paymentLimiter, csrfProtection, createPaymentValidation, async (req, res) => {
  // 檢查輸入驗證結果
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn("Validation failed", { errors: errors.array() });
    return res.status(400).json({
      error: "輸入資料不正確",
      details: errors.array().map((e) => e.msg),
    });
  }

  const { turnstileToken, email } = req.body;

  if (process.env.TURNSTILE_ENABLE === "true") {
    // 驗證 token
    if (!turnstileToken) {
      logger.warn("Turnstile token is missing");
      return res.status(400).json({ error: "Turnstile token is required" });
    }

    try {
      const turnstileResponse = await axios.post(TURNSTILE_VERIFY_URL, {
        secret: TURNSTILE_SECRET_KEY,
        response: turnstileToken,
      });

      if (!turnstileResponse.data.success) {
        logger.warn("Turnstile verification failed", {
          errorCodes: turnstileResponse.data["error-codes"],
        });
        return res.status(400).json({ error: "Turnstile verification failed" });
      }
    } catch (error) {
      return sendSecureError(res, 500, "Turnstile 驗證錯誤", {
        message: error.message,
      });
    }
  }

  const payuniApiUrl = process.env.PAYUNI_API_URL;
  const merID = process.env.PAYUNI_MERCHANT_ID;
  const hashKey = process.env.PAYUNI_HASH_KEY;
  const hashIV = process.env.PAYUNI_HASH_IV;

  const tradeNo = "test" + new Date().getTime();
  const tradeAmt = 100;
  const timestamp = Math.round(new Date().getTime() / 1000);

  // ReturnURL 驗證（防止開放重定向）
  // 從環境變數 PAYUNI_RETURN_URL 取得，使用白名單驗證
  const returnUrl = process.env.PAYUNI_RETURN_URL || ALLOWED_RETURN_URLS[0];

  const tradeData = {
    MerID: merID,
    Version: "1.0",
    MerTradeNo: tradeNo,
    TradeAmt: tradeAmt,
    ProdDesc: "Test Product",
    NotifyURL: process.env.NOTIFY_URL,
    ReturnURL: returnUrl, // PAYUNi 的重導向 URL
    PayType: "C",
    Timestamp: timestamp,
  };

  const plaintext = querystring.stringify(tradeData);
  const merKey = hashKey;
  const merIv = Buffer.from(hashIV, "utf8");
  const encryptStr = encrypt(plaintext, merKey, merIv);

  try {
    // 透過 GAS 在 Google Sheets 先建立一筆訂單紀錄

    if (process.env.GAS_WEBHOOK_URL) {
      try {
        const gasRes = await axios.post(`${process.env.GAS_WEBHOOK_URL}?action=createOrder`, {
          tradeNo,
          merID,
          tradeAmt,
          email: email || "",
        });
        if (!gasRes.data?.success) {
          logger.warn("GAS failed to create order", { tradeNo, response: gasRes.data });
          return sendSecureError(res, 500, "訂單建立失敗", { tradeNo });
        } else {
          logger.info("Order record created in Google Sheets", { tradeNo });
        }
      } catch (gasError) {
        logger.warn("Failed to create order in Google Sheets", {
          tradeNo,
          error: gasError.message,
        });
        return sendSecureError(res, 500, "訂單建立失敗", { tradeNo });
      }
    }

    logger.info("Payment created successfully", { tradeNo, amount: tradeAmt });
    res.json({
      payUrl: payuniApiUrl,
      data: {
        ...tradeData,
        EncryptInfo: encryptStr,
        HashInfo: sha256(encryptStr, merKey, merIv),
      },
    });
  } catch (error) {
    return sendSecureError(res, 500, "支付建立失敗", {
      tradeNo,
      message: error.message,
    });
  }
});

app.post("/payuni-webhook", async (req, res) => {
  try {
    // 只記錄必要資訊，避免洩漏敏感資料
    logger.info("Received Payuni webhook notification");

    // 驗證 HashInfo
    const { EncryptInfo, HashInfo, Status } = req.body;

    if (Status !== "SUCCESS") {
      logger.warn("Payment status is not SUCCESS", { status: Status });
      return res.send("FAIL");
    }

    const hashKey = process.env.PAYUNI_HASH_KEY;
    const hashIV = process.env.PAYUNI_HASH_IV;

    // 計算並驗證 Hash
    const calculatedHash = sha256(EncryptInfo, hashKey, hashIV);
    if (calculatedHash !== HashInfo) {
      logger.warn("Hash verification failed");
      return res.send("FAIL");
    }

    // 解密資料
    const merIv = Buffer.from(hashIV, "utf8");
    const decryptedData = decrypt(EncryptInfo, hashKey, merIv);

    // 解析解密後的資料
    const parsedData = querystring.parse(decryptedData);

    // 從解密資料中提取訂單資訊
    const tradeNo = parsedData.MerTradeNo;
    const tradeSeq = parsedData.TradeSeq;
    const payStatus = parsedData.Status || "已完成";

    if (!tradeNo) {
      logger.warn("Missing MerTradeNo in webhook data");
      return res.send("FAIL");
    }

    // 只記錄訂單編號和狀態，不記錄完整資料
    logger.info("Webhook verified", { tradeNo, tradeSeq, payStatus });

    // 如果有 GAS_WEBHOOK_URL，呼叫 GAS 更新訂單狀態
    if (process.env.GAS_WEBHOOK_URL) {
      try {
        const updateData = {
          MerTradeNo: tradeNo,
          TradeSeq: tradeSeq,
          Status: payStatus,
          rawData: parsedData,
        };

        const gasResponse = await axios.post(`${process.env.GAS_WEBHOOK_URL}?action=updateOrder`, updateData);

        if (!gasResponse.data?.success) {
          logger.warn("GAS failed to update order", { tradeNo });
          return res.send("FAIL");
        } else {
          logger.info("Order updated in Google Sheets", { tradeNo, status: payStatus });
        }
      } catch (gasError) {
        logger.warn("Failed to update order in Google Sheets", {
          tradeNo,
          error: gasError.message,
        });
        return res.send("FAIL");
      }
    }

    logger.info("Webhook processed successfully", { tradeNo, status: payStatus });
    res.send("SUCCESS");
  } catch (error) {
    logger.error("Webhook processing error", {
      message: error.message,
    });
    res.send("ERROR");
  }
});

app.post("/", async (req, res) => {
  // PAYUNi 的 ReturnURL 回調通常是透過表單 POST 到這裡
  // 需要同時處理 /payuni-webhook 的邏輯
  try {
    logger.info("Received root POST request");

    // 驗證 HashInfo
    const { EncryptInfo, HashInfo, Status } = req.body;

    if (!EncryptInfo || !HashInfo) {
      // 不是 PAYUNi 回調，直接返回成功
      logger.warn("Missing EncryptInfo or HashInfo in root POST");
      return res.send("SUCCESS");
    }

    if (Status !== "SUCCESS") {
      logger.warn("Payment status is not SUCCESS", { status: Status });
      return res.send("FAIL");
    }

    const hashKey = process.env.PAYUNI_HASH_KEY;
    const hashIV = process.env.PAYUNI_HASH_IV;

    // 計算並驗證 Hash
    const calculatedHash = sha256(EncryptInfo, hashKey, hashIV);
    if (calculatedHash !== HashInfo) {
      logger.warn("Hash verification failed");
      return res.send("FAIL");
    }

    // 解密資料
    const merIv = Buffer.from(hashIV, "utf8");
    const decryptedData = decrypt(EncryptInfo, hashKey, merIv);

    // 解析解密後的資料
    const parsedData = querystring.parse(decryptedData);

    // 從解密資料中提取訂單資訊
    const tradeNo = parsedData.MerTradeNo;
    const tradeSeq = parsedData.TradeSeq;
    const payStatus = parsedData.Status || "已完成";

    if (!tradeNo) {
      logger.warn("Missing MerTradeNo in parsed data");
      return res.send("FAIL");
    }

    // 只記錄訂單編號和狀態，不記錄完整資料
    logger.info("ReturnURL Callback verified", { tradeNo, tradeSeq, payStatus });

    logger.info("ReturnURL processed successfully", { tradeNo, status: payStatus });
    res.send("SUCCESS");
  } catch (error) {
    logger.error("Root POST processing error", {
      message: error.message,
    });
    res.send("SUCCESS");
  }
});

// 靜態檔案已由 express.static() 自動服務 (GET /)
// 不需要額外的路由

// ========================================
// 錯誤處理與伺服器啟動
// ========================================

// 全域錯誤處理
app.use((err, req, res, next) => {
  logger.error("Unhandled error", {
    message: err.message,
    path: req.path,
    method: req.method,
  });
  res.status(500).json({ error: "Internal server error" });
});

// 未捕捉的例外
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", {
    message: error.message,
  });
  process.exit(1);
});

// 未處理的 Promise 拒絕
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled rejection", {
    reason: String(reason),
  });
});

const server = app.listen(port, () => {
  logger.info(`Backend server listening at http://localhost:${port}`);
  printSuccess(port);
});

// 伺服器錯誤監聽
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
