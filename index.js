const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const cors = require("cors");
const querystring = require("querystring");
const rateLimit = require("express-rate-limit");
const { body, validationResult } = require("express-validator");
const helmet = require("helmet");
const logger = require("./logger");
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
        scriptSrc: ["'self'", "'unsafe-inline'", "https://challenges.cloudflare.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://challenges.cloudflare.com"],
        frameSrc: ["https://challenges.cloudflare.com"],
        connectSrc: ["'self'", "https://challenges.cloudflare.com", "https://cablate-payuni.zeabur.app"],
        imgSrc: ["'self'", "https:"],
        formAction: ["'self'", "https://sandbox-api.payuni.com.tw", "https://api.payuni.com.tw"], // 允許提交到 PAYUNi
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
    const allowedOrigins = [process.env.PAYUNI_RETURN_URL || "https://cablate-payuni.zeabur.app", "http://localhost:3000", "http://localhost"];

    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      logger.warn("CORS blocked request", { origin });
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

const paymentLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 分鐘
  max: 5, // 每個 IP 最多 5 次支付請求
  message: { error: "支付請求過於頻繁，請稍後再試" },
  skipSuccessfulRequests: false,
});

// 4. PAYUNi ReturnURL 白名單驗證
const ALLOWED_RETURN_URLS = [process.env.PAYUNI_RETURN_URL || "https://cablate-payuni.zeabur.app", "http://localhost:3000", "http://localhost"];

app.use(express.json());
app.use(express.urlencoded({ extended: true })); // 支援 form-urlencoded 格式

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

app.post("/create-payment", paymentLimiter, createPaymentValidation, async (req, res) => {
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

// 套用 Rate Limiting 到所有路由
app.use(generalLimiter);

app.post("/", (req, res) => {
  logger.info("Received root POST request", { body: req.body });
  res.send("SUCCESS");
});

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

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

function encrypt(plaintext, key, iv) {
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  let cipherText = cipher.update(plaintext, "utf8", "base64");
  cipherText += cipher.final("base64");

  const tag = cipher.getAuthTag().toString("base64");
  return Buffer.from(`${cipherText}:::${tag}`).toString("hex").trim();
}

function sha256(encryptStr, key, iv) {
  const hash = crypto.createHash("sha256").update(`${key}${encryptStr}${iv}`);
  return hash.digest("hex").toUpperCase();
}

function decrypt(encryptStr, key, iv) {
  const [encryptData, tag] = Buffer.from(encryptStr, "hex").toString().split(":::");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(Buffer.from(tag, "base64"));

  let decipherText = decipher.update(encryptData, "base64", "utf8");
  decipherText += decipher.final("utf8");

  return decipherText;
}
