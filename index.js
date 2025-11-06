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

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // 支援 form-urlencoded 格式

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
    ReturnURL: "https://cablate-payuni.zeabur.app/",
    PayType: "C",
    Timestamp: timestamp,
  };

  const plaintext = querystring.stringify(tradeData);
  const merKey = hashKey;
  const merIv = Buffer.from(hashIV, "utf8");
  const encryptStr = encrypt(plaintext, merKey, merIv);

  try {
    // 透過 GAS 在 Google Sheets 先建立一筆訂單紀錄
    const { email } = req.body;

    if (process.env.GAS_WEBHOOK_URL) {
      try {
        const res = await axios.post(`${process.env.GAS_WEBHOOK_URL}?action=createOrder`, {
          tradeNo,
          merID,
          tradeAmt,
          email: email || "",
        });
        if (!res.data?.success) {
          logger.warn("GAS failed to create order", { tradeNo, response: res.data });
          return res.status(500).json({ error: "Failed to create order record" });
        } else {
          logger.info("Order record created in Google Sheets", { tradeNo });
        }
      } catch (gasError) {
        logger.warn("Failed to create order in Google Sheets", {
          tradeNo,
          error: gasError.message,
        });
        return res.status(500).json({ error: "Failed to create order record" });
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
    logger.error("Payment creation failed", {
      tradeNo,
      message: error.message,
      stack: error.stack,
    });
    res.status(500).send("Error creating payment");
  }
});

app.post("/payuni-webhook", async (req, res) => {
  try {
    logger.info("Received Payuni webhook notification", req.body);

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
      logger.warn("Hash verification failed", { provided: HashInfo, calculated: calculatedHash });
      return res.send("FAIL");
    }

    // 解密資料
    const merIv = Buffer.from(hashIV, "utf8");
    const decryptedData = decrypt(EncryptInfo, hashKey, merIv);
    logger.info("Decrypted webhook data", { data: decryptedData });

    // 解析解密後的資料
    const parsedData = querystring.parse(decryptedData);
    logger.info("Parsed webhook data", { parsedData });

    // 從解密資料中提取訂單資訊
    const tradeNo = parsedData.MerTradeNo;
    const tradeSeq = parsedData.TradeSeq;
    const payStatus = parsedData.Status || "已完成";

    if (!tradeNo) {
      logger.warn("Missing MerTradeNo in webhook data");
      return res.send("FAIL");
    }

    // 如果有 GAS_WEBHOOK_URL，呼叫 GAS 更新訂單狀態
    if (process.env.GAS_WEBHOOK_URL) {
      try {
        const updateData = {
          MerTradeNo: tradeNo,
          TradeSeq: tradeSeq,
          Status: payStatus,
          rawData: parsedData, // 包含所有解密後的資料
        };

        const gasResponse = await axios.post(`${process.env.GAS_WEBHOOK_URL}?action=updateOrder`, updateData);
        logger.info("GAS update order response", { tradeNo, data: gasResponse.data });

        if (!gasResponse.data?.success) {
          logger.warn("GAS failed to update order", { tradeNo, response: gasResponse.data });
          return res.send("FAIL");
        } else {
          logger.info("Order updated in Google Sheets via GAS", { tradeNo, status: payStatus });
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
      stack: error.stack,
    });
    res.send("ERROR");
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

const aaa =
  "2b7a76755a774d484362695631666d41764a59564853416d525a4947374977507759386f4e303655393435747646497a4a31494641365344464754392f68754e797636665479704873445732395246515a5a75504c7468556673774c66454e503571337937596e586d47304b6374745274327868536d2b6343582b756c516a74773243342b48584b455275576c742b2b6268642f3047482b4f3936434e44763557703136666369705670326844336279754d325070694b6c684142526c58707541473134754668456b7155646343787453464d34716f31494850477650713549704d5667464c2f646c554c58303037436a785437334a6f517871546c64437165764452676650515a78353673686b476b6a705936755a6c746b323371664a4e626d782b69424f446647617849474c754c52766547416c7048564834494b4d6878554858766168615649457248356c57326e527644714679706d2b31716476377045614a2b77575a7a706b356679495a664661636e536e692b363177516c766c4f356c496a446a644e7557355257324554786c67464a54614f6a59783835544b786735754752734d7651572f76646b72463837415065464a317a62314e4a6e6f65465a5762316f3677704164306f783852415473373231394b675552367066706255374a455635356e327a7433662f6a42746e542b47563776475674454836724b75714832726650707a445733624965492f6e515039433562377a5a3058716771504850767556426c78476d6c42355070596e636d6c642b2f506f765350345241672f6437416e756e2f7876774145663132533572466f64657a7a515a466563685032696750357a47353546612b5764586941663347704a664e366350347a716b526871744434656f794664466157525853674162616b45303349513d3a3a3a3632633465656f776167795370362f373771726841773d3d";
console.log(decrypt(aaa, process.env.PAYUNI_HASH_KEY, Buffer.from(process.env.PAYUNI_HASH_IV, "utf8")));
