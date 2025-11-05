const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const cors = require("cors");
const querystring = require("querystring");

require("dotenv").config();

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

app.post("/create-payment", async (req, res) => {
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
    ReturnURL: "http://localhost:3000",
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
    console.log("Payment Created:", tradeData);
    res.json({
      payUrl: process.env.PAYUNI_API_URL,
      data: {
        ...tradeData,
        EncryptInfo: encryptStr,
        HashInfo: sha256(encryptStr, merKey, merIv),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error creating payment");
  }
});

app.post("/", (req, res) => {
  console.log("Notify:", req.body);
  res.send("SUCCESS");
});

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

app.listen(port, () => {
  console.log(`Backend server listening at http://localhost:${port}`);
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
