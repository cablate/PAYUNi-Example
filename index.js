const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { encrypt, decrypt, sha256 } = require("./utils/crypto");
const crypto = require("crypto");
const cors = require("cors");
const querystring = require("querystring");
const rateLimit = require("express-rate-limit");
const { body, validationResult } = require("express-validator");
const helmet = require("helmet");
const session = require("express-session");
const csrf = require("csurf");
const logger = require("./utils/logger");
const { printStartupBanner, printEnvironmentConfig, printSuccess, printWarning, printError } = require("./startup");
const products = require("./data/products"); // 引入商品資料
const { OAuth2Client } = require("google-auth-library");

require("dotenv").config();

// ++++++++++ Google OAuth Client 初始化 ++++++++++
const oauth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);
// +++++++++++++++++++++++++++++++++++++++++++++

// 印出啟動畫面
printStartupBanner();

// 檢查必要的環境變數
const requiredEnvVars = [
  "PAYUNI_API_URL",
  "PAYUNI_MERCHANT_ID",
  "PAYUNI_HASH_KEY",
  "PAYUNI_HASH_IV",
  "TURNSTILE_SECRET_KEY",
  "NOTIFY_URL",
  "GAS_WEBHOOK_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "SESSION_SECRET",
];

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

// 用於儲存一次性權杖的記憶體內存儲
const oneTimeTokens = new Map();

// ========================================
// 安全設定
// ========================================

// 1. Helmet 安全標頭設定
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // 允許 Google 登入的 script 和圖片來源
        scriptSrc: ["'self'", "https://challenges.cloudflare.com", "https://accounts.google.com/gsi/client"],
        styleSrc: ["'self'", "https://challenges.cloudflare.com"],
        frameSrc: ["https://challenges.cloudflare.com", "https://accounts.google.com/gsi/"],
        connectSrc: ["'self'", "https://challenges.cloudflare.com", process.env.DOMAIN],
        imgSrc: ["'self'", "https://challenges.cloudflare.com", "data:", "https://lh3.googleusercontent.com", "https://developers.google.com"], // 允許 Google 個人資料圖片和登入按鈕圖示
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

// 2. CORS 白名單限制
const corsOptions = {
  origin: function (origin, callback) {
    // 構建允許的來源列表
    const allowedOrigins = [
      // 前端/返回 URL
      process.env.PAYUNI_RETURN_URL || "https://exam2ple.com",
      process.env.DOMAIN || "https://exam2ple.com",
      "https://sandbox-api.payuni.com.tw",
      "https://api.payuni.com.tw",
      // 開發環境
      "http://localhost",
      "http://127.0.0.1",
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
  max: 200, // 每個 IP 最多 200 個請求
  message: { error: "請求過於頻繁，請稍後再試" },
  standardHeaders: true,
  legacyHeaders: false,
});

const paymentLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 分鐘
  max: 5, // 每個 IP 最多 5 次支付請求
  message: { error: "支付請求過於頻繁，請稍後再試" },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiResultLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 分鐘
  max: 10, // 每個 IP 最多 10 次請求
  message: { error: "查詢請求過於頻繁，請稍後再試" },
  standardHeaders: true,
  legacyHeaders: false,
});

// 4. PAYUNi ReturnURL 白名單驗證
const ALLOWED_RETURN_URLS = [process.env.PAYUNI_RETURN_URL || "https://exam2ple.com"];

app.use(express.json());
app.use(express.urlencoded({ extended: true })); // 支援 form-urlencoded 格式

// --- 分層速率限制策略 ---
// 優先提供靜態檔案，不進行速率限制
app.use(express.static(path.join(__dirname))); // 根目錄 (index.html, result.html)
app.use(express.static(path.join(__dirname, "public"))); // public 子目錄 (css, js)

// 為所有剩餘的動態路由套用通用的速率限制
app.use(generalLimiter);

// Session 配置（用於 CSRF 防護 & Google 登入）
app.use(
  session({
    secret: process.env.SESSION_SECRET, // 已從 .env 讀取
    resave: false,
    saveUninitialized: false, // 改為 false，避免為未登入使用者建立 session
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

// 定義需要從 CSRF 保護中排除的路徑
const csrfExcludedPaths = ["/payment-return", "/payuni-webhook"];

// 全域套用 CSRF 保護 (GET, HEAD, OPTIONS 除外，並排除特定路徑)
app.use((req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method) || csrfExcludedPaths.includes(req.path)) {
    return next();
  }
  csrfProtection(req, res, next);
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

// ++++++++++++++ Google Auth 路由 ++++++++++++++
app.get("/auth/google", (req, res) => {
  const authorizeUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/userinfo.profile", "https://www.googleapis.com/auth/userinfo.email"],
    prompt: "consent",
  });
  res.redirect(authorizeUrl);
});

app.get("/auth/google/callback", async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) {
      return sendSecureError(res, 400, "Google 登入失敗：缺少授權碼");
    }

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const ticket = await oauth2Client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    // 將使用者資訊存入 session
    req.session.user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
    };

    // 確保 session 儲存後再重導向
    req.session.save((err) => {
      if (err) {
        return sendSecureError(res, 500, "Session 儲存失敗", { message: err.message });
      }
      logger.info("User logged in successfully and session saved", { userId: payload.sub, email: payload.email });
      // 登入成功後導回首頁
      res.redirect("/");
    });
  } catch (error) {
    sendSecureError(res, 500, "Google 登入驗證過程中發生錯誤", { message: error.message });
  }
});

app.get("/api/me", (req, res) => {
  if (req.session.user) {
    res.json({ loggedIn: true, user: req.session.user });
  } else {
    res.json({ loggedIn: false });
  }
});

app.get("/api/my-orders", async (req, res) => {
  // 1. 檢查使用者是否登入
  if (!req.session.user) {
    return res.status(401).json({ error: "請先登入" });
  }

  try {
    // 2. 從 session 中獲取使用者的 email
    const userEmail = req.session.user.email;

    // 3. 呼叫 GAS Webhook
    const gasResponse = await axios.post(`${process.env.GAS_WEBHOOK_URL}?action=getMyOrders`, { email: userEmail });

    if (gasResponse.data && gasResponse.data.orders) {
      // 4. 成功，回傳訂單資料
      res.json({ success: true, orders: gasResponse.data.orders });
    } else {
      // GAS 回傳失敗
      throw new Error(gasResponse.data.message || "無法從 GAS 獲取訂單");
    }
  } catch (error) {
    sendSecureError(res, 500, "查詢訂單失敗", { message: error.message });
  }
});

app.get("/auth/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return sendSecureError(res, 500, "登出時發生錯誤");
    }
    // 清除 cookie 並導向首頁
    res.clearCookie("connect.sid"); // connect.sid 是 express-session 預設的 cookie 名稱
    res.redirect("/");
  });
});
// ++++++++++++++++++++++++++++++++++++++++++++++++

// 新增：提供前端配置資訊的 API
app.get("/api/client-config", (req, res) => {
  res.json({
    turnstileEnable: process.env.TURNSTILE_ENABLE === "true",
  });
});

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

// 新增：提供商品列表的 API
app.get("/api/products", (req, res) => {
  res.json(products);
});

// 定義 /create-payment 的驗證規則
const createPaymentValidation = [
  // Email 驗證已移除，因為現在強制要求登入
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
  // 強制要求登入
  if (!req.session.user) {
    return res.status(401).json({ error: "請先登入後再操作" });
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn("Validation failed", { errors: errors.array() });
    return res.status(400).json({ error: "輸入資料不正確", details: errors.array().map((e) => e.msg) });
  }

  // 使用者已登入，從 session 取得 email
  const userEmail = req.session.user.email;
  const { turnstileToken, productID } = req.body;

  // 根據 productID 查找商品
  const product = products.find((p) => p.id === productID);
  if (!product) {
    return res.status(404).json({ error: "找不到該商品" });
  }

  if (process.env.TURNSTILE_ENABLE === "true") {
    if (!turnstileToken) {
      logger.warn("Turnstile token is missing");
      return res.status(400).json({ error: "Turnstile token is required" });
    }
    try {
      const turnstileResponse = await axios.post(TURNSTILE_VERIFY_URL, { secret: TURNSTILE_SECRET_KEY, response: turnstileToken });
      if (!turnstileResponse.data.success) {
        logger.warn("Turnstile verification failed", { errorCodes: turnstileResponse.data["error-codes"] });
        return res.status(400).json({ error: "Turnstile verification failed" });
      }
    } catch (error) {
      return sendSecureError(res, 500, "Turnstile 驗證錯誤", { message: error.message });
    }
  }

  const payuniApiUrl = process.env.PAYUNI_API_URL;
  const merID = process.env.PAYUNI_MERCHANT_ID;
  const hashKey = process.env.PAYUNI_HASH_KEY;
  const hashIV = process.env.PAYUNI_HASH_IV;

  if (process.env.GAS_WEBHOOK_URL) {
    try {
      const findRes = await axios.post(`${process.env.GAS_WEBHOOK_URL}?action=findOrder`, { email: userEmail, productID: product.id });
      if (findRes.data?.success && findRes.data?.order) {
        logger.info(JSON.stringify(findRes.data.order));
        logger.info("Found existing pending order, reusing it.", { tradeNo: findRes.data.order.tradeNo });
        const { tradeNo: existingTradeNo, tradeAmt: existingTradeAmt } = findRes.data.order;
        const timestamp = Math.round(new Date().getTime() / 1000);
        const returnUrl = process.env.PAYUNI_RETURN_URL || ALLOWED_RETURN_URLS[0];

        const tradeData = { MerID: merID, Version: "1.0", MerTradeNo: existingTradeNo, TradeAmt: existingTradeAmt, ProdDesc: product.name, NotifyURL: process.env.NOTIFY_URL, ReturnURL: returnUrl, PayType: "C", Timestamp: timestamp, UsrMail: userEmail, UsrMailFix: 1 };
        const plaintext = querystring.stringify(tradeData);
        const merKey = hashKey;
        const merIv = Buffer.from(hashIV, "utf8");
        const encryptStr = encrypt(plaintext, merKey, merIv);

        logger.info("Reusing existing order for payment.", { tradeNo: existingTradeNo });

        return res.json({ payUrl: payuniApiUrl, data: { ...tradeData, EncryptInfo: encryptStr, HashInfo: sha256(encryptStr, merKey, merIv) } });
      }
    } catch (findError) {
      logger.warn("Failed to check for existing order, proceeding to create a new one.", { error: findError.message });
    }
  }

  const tradeNo = "test" + new Date().getTime();
  const tradeAmt = product.price; // 使用商品資料中的價格
  const prodDesc = product.name; // 使用商品資料中的名稱
  const timestamp = Math.round(new Date().getTime() / 1000);
  const returnUrl = process.env.PAYUNI_RETURN_URL || ALLOWED_RETURN_URLS[0];

  const tradeData = { MerID: merID, Version: "1.0", MerTradeNo: tradeNo, TradeAmt: tradeAmt, ProdDesc: prodDesc, NotifyURL: process.env.NOTIFY_URL, ReturnURL: returnUrl, PayType: "C", Timestamp: timestamp, UsrMail: userEmail, UsrMailFix: 1 };
  const plaintext = querystring.stringify(tradeData);
  const merKey = hashKey;
  const merIv = Buffer.from(hashIV, "utf8");
  const encryptStr = encrypt(plaintext, merKey, merIv);

  try {
    if (process.env.GAS_WEBHOOK_URL) {
      try {
        // 準備傳遞到 Google Apps Script 的資料
        const gasOrderData = {
          tradeNo,
          merID,
          tradeAmt,
          email: userEmail,
          productID: product.id,
          productName: product.name,
          // 如果使用者已登入，則傳遞使用者資訊
          ...(req.session.user && {
            userGoogleId: req.session.user.id,
            userEmail: req.session.user.email,
            userName: req.session.user.name,
          }),
        };

        const gasRes = await axios.post(`${process.env.GAS_WEBHOOK_URL}?action=createOrder`, gasOrderData);
        if (!gasRes.data?.success) {
          logger.warn("GAS failed to create order", { tradeNo, response: gasRes.data });
          return sendSecureError(res, 500, "訂單建立失敗", { tradeNo });
        } else {
          logger.info("Order record created in Google Sheets", { tradeNo });
        }
      } catch (gasError) {
        logger.warn("Failed to create order in Google Sheets", { tradeNo, error: gasError.message });
        return sendSecureError(res, 500, "訂單建立失敗", { tradeNo });
      }
    }
    logger.info("Payment created successfully", { tradeNo, amount: tradeAmt });
    res.json({ payUrl: payuniApiUrl, data: { MerID: merID, Version: "1.0", EncryptInfo: encryptStr, HashInfo: sha256(encryptStr, merKey, merIv) } });
  } catch (error) {
    return sendSecureError(res, 500, "支付建立失敗", { tradeNo, message: error.message });
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
    const tradeSeq = parsedData.TradeNo;
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
    res.send(Status === "SUCCESS" ? "OK" : "FAIL");
  } catch (error) {
    logger.error("Webhook processing error", {
      message: error.message,
    });
    res.send("ERROR");
  }
});

// PAYUNi ReturnURL 端點
app.post("/payment-return", async (req, res) => {
  try {
    logger.info("Received Payuni return request");
    const { EncryptInfo, HashInfo, Status } = req.body;

    // 驗證 Hash
    const hashKey = process.env.PAYUNI_HASH_KEY;
    const hashIV = process.env.PAYUNI_HASH_IV;
    const calculatedHash = sha256(EncryptInfo, hashKey, hashIV);

    if (calculatedHash !== HashInfo) {
      logger.warn("Return URL hash verification failed");
      // 即使驗證失敗，也導向結果頁，但帶上失敗狀態
      return res.redirect("/result.html?status=fail&reason=invalid_hash");
    }

    // 解密資料
    const merIv = Buffer.from(hashIV, "utf8");
    const decryptedData = querystring.parse(decrypt(EncryptInfo, hashKey, merIv));

    const resultData = {
      status: Status === "SUCCESS" ? "success" : "fail",
      tradeNo: decryptedData.MerTradeNo,
      tradeSeq: decryptedData.TradeNo,
      tradeAmt: decryptedData.TradeAmt,
      payTime: decryptedData.PayTime || new Date().toISOString(),
      message: decryptedData.Message,
    };

    // 產生一個一次性權杖
    const token = crypto.randomBytes(32).toString("hex");

    // 將結果與權杖關聯，並設定 5 分鐘後過期
    oneTimeTokens.set(token, resultData);
    setTimeout(() => oneTimeTokens.delete(token), 300000); // 5 minutes

    logger.info("Return data processed, redirecting to result page with token", { tradeNo: resultData.tradeNo });
    // 重新導向到結果頁，並附上權杖
    res.redirect(`/result.html?token=${token}`);
  } catch (error) {
    logger.error("Return URL processing error", { message: error.message });
    res.redirect("/result.html?status=fail&reason=processing_error");
  }
});

// API 端點，用於前端憑權杖獲取訂單結果
app.get("/api/order-result/:token", apiResultLimiter, (req, res) => {
  const { token } = req.params;
  const resultData = oneTimeTokens.get(token);

  if (resultData) {
    // 找到資料，回傳它並立即刪除權杖
    oneTimeTokens.delete(token);
    logger.info("Order result retrieved with token", { tradeNo: resultData.tradeNo });
    res.json(resultData);
  } else {
    // 找不到權杖（可能已使用或過期）
    logger.warn("Invalid or expired token received", { token });
    res.status(404).json({ error: "無效或已過期的連結" });
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
