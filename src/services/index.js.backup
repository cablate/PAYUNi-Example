import logger from "../utils/logger.js";
import { getDatabase } from "./database/provider.js";
import { getPayuniSDK } from "./payment/provider.js";

/**
 * 查詢現有未完成訂單
 */
export async function findExistingOrder(userEmail, productID) {
  try {
    const db = getDatabase();
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
 * 建立支付訂單
 */
export async function createOrder(orderData) {
  try {
    const formattedData = {
      tradeNo: orderData.tradeNo,
      merID: orderData.merID || orderData.MerID,
      tradeAmt: orderData.tradeAmt || orderData.TradeAmt,
      email: orderData.email,
      productID: orderData.productID,
      productName: orderData.productName,
    };

    const db = getDatabase();
    const success = await db.createOrder(formattedData);
    if (success) {
      logger.info("Order record created in Google Sheets", { 
        tradeNo: formattedData.tradeNo, 
        email: formattedData.email 
      });
      return true;
    }
    return false;
  } catch (error) {
    logger.warn("Failed to create order in Google Sheets", { 
      tradeNo: orderData.tradeNo, 
      error: error.message 
    });
    return false;
  }
}

/**
 * 更新訂單狀態
 */
export async function updateOrder(updateData) {
  try {
    const db = getDatabase();
    const success = await db.updateOrder(updateData);
    if (success) {
      logger.info("Order updated in Google Sheets", { 
        tradeNo: updateData.MerTradeNo, 
        status: updateData.Status 
      });
      return true;
    }
    return false;
  } catch (error) {
    logger.warn("Failed to update order in Google Sheets", { 
      tradeNo: updateData.MerTradeNo, 
      error: error.message 
    });
    return false;
  }
}

/**
 * 生成支付資料（一次性）
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
 * 生成支付資料（訂閱制）
 */
export function generatePeriodPaymentData(tradeNo, product, userEmail, returnUrl) {
  const sdk = getPayuniSDK();
  const periodPaymentInfo = sdk.generatePeriodPaymentInfo(tradeNo, product, userEmail, returnUrl);

  logger.info("Period payment data generated", {
    tradeNo,
    productId: product.id,
    periodType: product.periodConfig?.periodType,
    periodTimes: product.periodConfig?.periodTimes,
  });

  return {
    payUrl: periodPaymentInfo.payUrl,
    data: periodPaymentInfo.data,
  };
}
