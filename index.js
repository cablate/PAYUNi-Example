const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const cors = require("cors");
const querystring = require("querystring");
const logger = require("./logger");

require("dotenv").config();

// 驗證必要的環境變數
const requiredEnvVars = ["PAYUNI_API_URL", "PAYUNI_MERCHANT_ID", "PAYUNI_HASH_KEY", "PAYUNI_HASH_IV", "TURNSTILE_SECRET_KEY"];

const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error(`❌ 錯誤：缺少以下必要的環境變數: ${missingEnvVars.join(", ")}`);
  process.exit(1);
}

// 印出所有環境變數配置
console.log("\n📋 環境變數配置：");
console.log(`  PAYUNI_API_URL: ${process.env.PAYUNI_API_URL}`);
console.log(`  PAYUNI_MERCHANT_ID: ${process.env.PAYUNI_MERCHANT_ID}`);
console.log(`  PAYUNI_HASH_KEY: ${process.env.PAYUNI_HASH_KEY?.substring(0, 10)}...`);
console.log(`  PAYUNI_HASH_IV: ${process.env.PAYUNI_HASH_IV?.substring(0, 10)}...`);
console.log(`  TURNSTILE_SECRET_KEY: ${process.env.TURNSTILE_SECRET_KEY?.substring(0, 10)}...`);
console.log(`  LOG_LEVEL: ${process.env.LOG_LEVEL || "info (預設)"}`);
console.log(`  NODE_ENV: ${process.env.NODE_ENV || "development (預設)"}\n`);

// 檢查是否為沙箱環境
if (!process.env.PAYUNI_API_URL.includes("sandbox")) {
  console.warn("\n⚠️  警告：當前設定的 PAYUNI_API_URL 不是測試環境！請確認您是否要使用正式環境。\n");
}

const app = express();
const port = 80;

const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY;
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

app.use(cors());
app.use(express.json());

// 請求日誌中間件
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get("user-agent"),
  });
  next();
});

app.post("/create-payment", async (req, res) => {
  const { turnstileToken } = req.body;

  logger.info("Payment creation requested");

  // 驗證 Turnstile token
  if (!turnstileToken) {
    logger.warn("Turnstile token is missing");
    return res.status(400).json({ error: "Turnstile token is required" });
  }

  try {
    logger.debug("Verifying Turnstile token");
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

    logger.info("Turnstile verification successful");
  } catch (error) {
    logger.error("Turnstile verification error", {
      message: error.message,
      stack: error.stack,
    });
    return res.status(500).json({ error: "Turnstile verification error" });
  }

  const payuniApiUrl = process.env.PAYUNI_API_URL;
  const merID = process.env.PAYUNI_MERCHANT_ID;
  const hashKey = process.env.PAYUNI_HASH_KEY;
  const hashIV = process.env.PAYUNI_HASH_IV;

  const tradeNo = "test" + new Date().getTime();
  const tradeAmt = 100;
  const timestamp = Math.round(new Date().getTime() / 1000);

  const tradeData = {
    MerID: merID,
    Version: "1.0",
    MerTradeNo: tradeNo,
    TradeAmt: tradeAmt,
    ProdDesc: "Test Product",
    NotifyURL: "https://n8n-cablate.zeabur.app/webhook-test/payuni-notify",
    ReturnURL: "http://localhost",
    PayType: "C",
    Timestamp: timestamp,
  };

  const plaintext = querystring.stringify(tradeData);
  const merKey = hashKey;
  const merIv = Buffer.from(hashIV, "utf8");
  const encryptStr = encrypt(plaintext, merKey, merIv);

  const postData = new URLSearchParams({
    ...tradeData,
    EncryptInfo: encryptStr,
    HashInfo: sha256(encryptStr, merKey, merIv),
  });

  try {
    logger.debug("Creating payment with Payuni", { tradeNo });
    await axios.post(payuniApiUrl, postData.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
    logger.info("Payment created successfully", { tradeNo, amount: tradeAmt });
    res.json({
      payUrl: process.env.PAYUNI_API_URL,
      data: {
        ...tradeData,
        EncryptInfo: encryptStr,
        HashInfo: sha256(encryptStr, merKey, merIv),
      },
    });
  } catch (error) {
    logger.error("Payment creation failed", {
      tradeNo,
      message: error.message,
      stack: error.stack,
    });
    res.status(500).send("Error creating payment");
  }
});

app.post("/", (req, res) => {
  logger.info("Payment notification received", { body: req.body });
  res.send("SUCCESS");
});

app.get("/", (req, res) => {
  logger.debug("Serving index.html");
  res.sendFile(__dirname + "/index.html");
});

// 全域錯誤處理中間件
app.use((err, req, res, next) => {
  logger.error("Unhandled error", {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });
  res.status(500).json({ error: "Internal server error" });
});

// 處理未捕捉的例外
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", {
    message: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

// 處理未處理的 Promise 拒絕
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled rejection", {
    reason,
    promise,
  });
});

const server = app.listen(port, () => {
  logger.info(`Backend server listening at http://localhost:${port}`);
});

// 監聽伺服器錯誤
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
