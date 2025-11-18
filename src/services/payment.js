import axios from "axios";
import querystring from "querystring";
import { EXTERNAL_SERVICES, PAYUNI_CONFIG, TURNSTILE_CONFIG } from "../config/constants.js";
import { decrypt, encrypt, sha256 } from "../utils/crypto.js";
import logger from "../utils/logger.js";
import { getOrderDatabase } from "./database/OrderDatabaseProvider.js";

/**
 * 驗證 Turnstile 驗證碼
 */
export async function verifyTurnstile(token) {
  if (!TURNSTILE_CONFIG.ENABLE) {
    return true;
  }

  if (!token) {
    logger.warn("Turnstile token is missing");
    return false;
  }

  try {
    const response = await axios.post(TURNSTILE_CONFIG.VERIFY_URL, {
      secret: TURNSTILE_CONFIG.SECRET_KEY,
      response: token,
    });

    if (!response.data.success) {
      logger.warn("Turnstile verification failed", { errorCodes: response.data["error-codes"] });
      return false;
    }

    return true;
  } catch (error) {
    logger.error("Turnstile verification error", { message: error.message });
    throw error;
  }
}

/**
 * 查詢現有未完成訂單
 */
export async function findExistingOrder(userEmail, productID) {
  try {
    const db = getOrderDatabase();
    const order = await db.findPendingOrder(userEmail, productID);
    if (order) {
      logger.info("Found existing pending order, reusing it.", { tradeNo: order.tradeNo });
      return order;
    }
    return null;
  } catch (error) {
    logger.warn("Failed to check for existing order", { error: error.message });
    return null;
  }
}

/**
 * 建立支付訂單（使用 Google Sheets API）
 * 參數格式參考 GAS 的 createOrder() 函數
 */
export async function createOrderInGAS(orderData) {
  try {
    // 確保傳遞的參數符合 Sheets API 的格式
    const formattedData = {
      tradeNo: orderData.tradeNo,
      merID: orderData.merID || orderData.MerID,
      tradeAmt: orderData.tradeAmt || orderData.TradeAmt,
      email: orderData.email,
      productID: orderData.productID,
      productName: orderData.productName,
    };

    const db = getOrderDatabase();
    const success = await db.createOrder(formattedData);
    if (success) {
      logger.info("Order record created in Google Sheets", { tradeNo: formattedData.tradeNo, email: formattedData.email });
      return true;
    }
    return false;
  } catch (error) {
    logger.warn("Failed to create order in Google Sheets", { tradeNo: orderData.tradeNo, error: error.message });
    return false;
  }
}

/**
 * 更新訂單狀態（使用 Google Sheets API）
 */
export async function updateOrderInGAS(updateData) {
  try {
    const db = getOrderDatabase();
    const success = await db.updateOrder(updateData);
    if (success) {
      logger.info("Order updated in Google Sheets", { tradeNo: updateData.MerTradeNo, status: updateData.Status });
      return true;
    }
    return false;
  } catch (error) {
    logger.warn("Failed to update order in Google Sheets", { tradeNo: updateData.MerTradeNo, error: error.message });
    return false;
  }
}

/**
 * 生成支付資料
 */
export function generatePaymentData(tradeNo, product, userEmail, returnUrl) {
  const merID = PAYUNI_CONFIG.MERCHANT_ID;
  const hashKey = PAYUNI_CONFIG.HASH_KEY;
  const hashIV = PAYUNI_CONFIG.HASH_IV;
  const timestamp = Math.round(new Date().getTime() / 1000);

  const tradeData = {
    MerID: merID,
    Version: "1.0",
    MerTradeNo: tradeNo,
    TradeAmt: product.price,
    ProdDesc: product.name,
    NotifyURL: EXTERNAL_SERVICES.NOTIFY_URL,
    ReturnURL: returnUrl,
    PayType: "C",
    Timestamp: timestamp,
    UsrMail: userEmail,
    UsrMailFix: 1,
  };

  const plaintext = querystring.stringify(tradeData);
  const merKey = hashKey;
  const merIv = Buffer.from(hashIV, "utf8");
  const encryptStr = encrypt(plaintext, merKey, merIv);

  return {
    payUrl: PAYUNI_CONFIG.API_URL,
    data: {
      MerID: merID,
      Version: "1.0",
      EncryptInfo: encryptStr,
      HashInfo: sha256(encryptStr, merKey, merIv),
    },
  };
}

/**
 * 驗證 Webhook Hash
 */
export function verifyWebhookHash(encryptInfo, hashInfo) {
  const hashKey = PAYUNI_CONFIG.HASH_KEY;
  const hashIV = PAYUNI_CONFIG.HASH_IV;
  const calculatedHash = sha256(encryptInfo, hashKey, hashIV);

  if (calculatedHash !== hashInfo) {
    logger.warn("Hash verification failed");
    return false;
  }

  return true;
}

/**
 * 解密 Webhook 資料
 */
export function decryptWebhookData(encryptInfo) {
  const hashKey = PAYUNI_CONFIG.HASH_KEY;
  const hashIV = PAYUNI_CONFIG.HASH_IV;
  const merIv = Buffer.from(hashIV, "utf8");
  const decryptedData = decrypt(encryptInfo, hashKey, merIv);
  return querystring.parse(decryptedData);
}
