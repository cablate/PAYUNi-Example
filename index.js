const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const cors = require("cors");
const querystring = require("querystring");
const logger = require("./logger");
const { printStartupBanner, printEnvironmentConfig, printSuccess, printWarning, printError } = require("./startup");

require("dotenv").config();

// 印出啟動畫面
printStartupBanner();

// 檢查必要的環境變數
const requiredEnvVars = ["PAYUNI_API_URL", "PAYUNI_MERCHANT_ID", "PAYUNI_HASH_KEY", "PAYUNI_HASH_IV", "TURNSTILE_SECRET_KEY"];

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

app.use(cors());
app.use(express.json());

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

app.post("/create-payment", async (req, res) => {
  const { turnstileToken } = req.body;

  if (process.env.TURNSTILE_ENABLE) {
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
      logger.error("Turnstile verification error", {
        message: error.message,
        stack: error.stack,
      });
      return res.status(500).json({ error: "Turnstile verification error" });
    }
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
    NotifyURL: process.env.NOTIFY_URL,
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
  res.send("SUCCESS");
});

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

// 全域錯誤處理
app.use((err, req, res, next) => {
  logger.error("Unhandled error", {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });
  res.status(500).json({ error: "Internal server error" });
});

// 未捕捉的例外
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", {
    message: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

// 未處理的 Promise 拒絕
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled rejection", {
    reason,
    promise,
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
