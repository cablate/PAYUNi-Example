/**
 * 訂單服務
 *
 * 職責：
 * - 管理訂單的業務邏輯（建立、查詢、更新）
 * - 與資料庫互動
 * - 不涉及金流商的對接邏輯
 *
 * 設計理念：
 * - 這是「業務邏輯層」，不是「金流對接層」
 * - 訂單管理應該獨立於金流商的實作細節
 * - 金流對接邏輯請使用 PayuniGateway（或其他金流 Gateway）
 *
 * 使用範例：
 *   import { findExistingOrder, createOrder, updateOrder } from './order-service.js';
 *
 *   const existing = await findExistingOrder('user@example.com', 'product_123');
 *   const success = await createOrder(orderData);
 *   const updated = await updateOrder(updateData);
 */

import logger from "../utils/logger.js";
import { getDatabase } from "./database/provider.js";

// ========================================
// 訂單查詢
// ========================================

/**
 * 查詢現有的未完成訂單
 *
 * 用於避免重複建立訂單。如果使用者已有相同商品的未完成訂單，
 * 應該重複使用該訂單，而不是建立新的訂單。
 *
 * @param {string} userEmail - 使用者 Email
 * @param {string} productID - 商品 ID
 * @returns {Promise<Object|null>} 訂單物件，找不到返回 null
 *
 * @example
 * const existingOrder = await findExistingOrder('user@example.com', 'product_123');
 * if (existingOrder) {
 *   console.log('找到現有訂單', existingOrder.tradeNo);
 * }
 */
export async function findExistingOrder(userEmail, productID) {
  try {
    if (!userEmail || !productID) {
      logger.warn("查詢訂單缺少必要參數", { userEmail, productID });
      return null;
    }

    const db = getDatabase();
    const order = await db.findPendingOrder(userEmail, productID);

    if (order) {
      logger.info("找到現有未完成訂單，將重複使用", {
        tradeNo: order.tradeNo,
        email: userEmail,
        productID,
      });
      return order;
    }

    logger.info("沒有找到現有訂單", { email: userEmail, productID });
    return null;
  } catch (error) {
    logger.error("查詢現有訂單失敗", {
      email: userEmail,
      productID,
      error: error.message,
    });
    // 查詢失敗不應該阻擋後續流程，返回 null 讓流程繼續
    return null;
  }
}

// ========================================
// 訂單建立
// ========================================

/**
 * 建立新訂單
 *
 * 將訂單資料寫入資料庫。訂單建立後狀態為「待付款」，
 * 等待金流商的 Webhook 通知後才會更新為「已付款」。
 *
 * @param {Object} orderData - 訂單資料
 * @param {string} orderData.tradeNo - 訂單編號（必須唯一）
 * @param {string} orderData.merID - 商家 ID
 * @param {number} orderData.tradeAmt - 交易金額
 * @param {string} orderData.email - 使用者 Email
 * @param {string} orderData.productID - 商品 ID
 * @param {string} orderData.productName - 商品名稱
 * @param {string} [orderData.productType] - 商品類型（如 "subscription"）
 * @param {string} [orderData.userGoogleId] - 使用者 Google ID
 * @param {string} [orderData.userName] - 使用者名稱
 * @returns {Promise<boolean>} 建立成功返回 true，失敗返回 false
 *
 * @example
 * const orderData = {
 *   tradeNo: 'ORDER123456',
 *   merID: 'merchant_123',
 *   tradeAmt: 2999,
 *   email: 'user@example.com',
 *   productID: 'product_123',
 *   productName: '金流課程',
 * };
 * const success = await createOrder(orderData);
 */
export async function createOrder(orderData) {
  try {
    // 驗證必要欄位
    const requiredFields = [
      "tradeNo",
      "merID",
      "tradeAmt",
      "email",
      "productID",
      "productName",
    ];

    for (const field of requiredFields) {
      if (!orderData[field]) {
        logger.error(`建立訂單失敗：缺少必要欄位 ${field}`, { orderData });
        return false;
      }
    }

    // 格式化訂單資料（確保欄位名稱一致）
    const formattedData = {
      tradeNo: orderData.tradeNo,
      merID: orderData.merID || orderData.MerID,
      tradeAmt: orderData.tradeAmt || orderData.TradeAmt,
      email: orderData.email,
      productID: orderData.productID,
      productName: orderData.productName,
      // 可選欄位
      ...(orderData.productType && { productType: orderData.productType }),
      ...(orderData.userGoogleId && { userGoogleId: orderData.userGoogleId }),
      ...(orderData.userName && { userName: orderData.userName }),
    };

    // 寫入資料庫
    const db = getDatabase();
    const success = await db.createOrder(formattedData);

    if (success) {
      logger.info("訂單已建立", {
        tradeNo: formattedData.tradeNo,
        email: formattedData.email,
        productID: formattedData.productID,
        amount: formattedData.tradeAmt,
      });
      return true;
    } else {
      logger.error("資料庫建立訂單失敗", {
        tradeNo: formattedData.tradeNo,
      });
      return false;
    }
  } catch (error) {
    logger.error("建立訂單異常", {
      tradeNo: orderData.tradeNo,
      error: error.message,
    });
    return false;
  }
}

// ========================================
// 訂單更新
// ========================================

/**
 * 更新訂單狀態
 *
 * 通常在收到金流商的 Webhook 通知後調用，
 * 更新訂單的支付狀態、交易序號等資訊。
 *
 * @param {Object} updateData - 更新資料
 * @param {string} updateData.MerTradeNo - 商店訂單編號
 * @param {string} updateData.TradeSeq - 金流商交易序號
 * @param {string} updateData.Status - 訂單狀態（如「已付款」「付款失敗」）
 * @param {string} [updateData.PeriodTradeNo] - 續期收款單號（訂閱制用）
 * @param {string} [updateData.PaymentMethod] - 支付方式
 * @param {Object} [updateData.rawData] - 原始資料（用於除錯）
 * @returns {Promise<boolean>} 更新成功返回 true，失敗返回 false
 *
 * @example
 * const updateData = {
 *   MerTradeNo: 'ORDER123456',
 *   TradeSeq: 'PAY202512010001',
 *   Status: '已付款',
 *   PaymentMethod: '信用卡',
 * };
 * const success = await updateOrder(updateData);
 */
export async function updateOrder(updateData) {
  try {
    // 驗證必要欄位
    if (!updateData.MerTradeNo) {
      logger.error("更新訂單失敗：缺少訂單編號", { updateData });
      return false;
    }

    // 更新資料庫
    const db = getDatabase();
    const success = await db.updateOrder(updateData);

    if (success) {
      logger.info("訂單已更新", {
        tradeNo: updateData.MerTradeNo,
        status: updateData.Status,
        tradeSeq: updateData.TradeSeq,
      });
      return true;
    } else {
      logger.error("資料庫更新訂單失敗", {
        tradeNo: updateData.MerTradeNo,
      });
      return false;
    }
  } catch (error) {
    logger.error("更新訂單異常", {
      tradeNo: updateData.MerTradeNo,
      error: error.message,
    });
    return false;
  }
}

// ========================================
// 訂單查詢（進階）
// ========================================

/**
 * 根據訂單編號查詢訂單
 *
 * @param {string} tradeNo - 訂單編號
 * @returns {Promise<Object|null>} 訂單物件，找不到返回 null
 *
 * @example
 * const order = await getOrderByTradeNo('ORDER123456');
 * if (order) {
 *   console.log('訂單狀態', order.status);
 * }
 */
export async function getOrderByTradeNo(tradeNo) {
  try {
    if (!tradeNo) {
      logger.warn("查詢訂單缺少訂單編號");
      return null;
    }

    const db = getDatabase();
    const order = await db.getOrderByTradeNo(tradeNo);

    if (order) {
      logger.info("找到訂單", { tradeNo });
      return order;
    }

    logger.warn("找不到訂單", { tradeNo });
    return null;
  } catch (error) {
    logger.error("查詢訂單失敗", {
      tradeNo,
      error: error.message,
    });
    return null;
  }
}

// ========================================
// 預設匯出
// ========================================

export default {
  findExistingOrder,
  createOrder,
  updateOrder,
  getOrderByTradeNo,
};
