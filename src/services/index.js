import axios from "axios";
import { TURNSTILE_CONFIG } from "../config/constants.js";
import logger from "../utils/logger.js";
import { getOrderDatabase } from "./database/provider.js";
import { getPayuniSDK } from "./payment/provider.js";

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
  const sdk = getPayuniSDK();
  const paymentInfo = sdk.generatePaymentInfo(tradeNo, product, userEmail, returnUrl);
  
  return {
    payUrl: paymentInfo.payUrl,
    data: paymentInfo.data,
  };
}

/**
 * 驗證 Webhook Hash
 */
export function verifyWebhookHash(encryptInfo, hashInfo) {
  const sdk = getPayuniSDK();
  return sdk.verifyWebhookData(encryptInfo, hashInfo);
}

/**
 * 解密 Webhook 資料
 */
export function decryptWebhookData(encryptInfo) {
  const sdk = getPayuniSDK();
  return sdk.parseWebhookData(encryptInfo);
}

/**
 * 驗證並解析 Webhook 資料（推薦使用）
 */
export function validateAndParseWebhook(encryptInfo, hashInfo) {
  const sdk = getPayuniSDK();
  return sdk.validateAndParseWebhook(encryptInfo, hashInfo);
}
