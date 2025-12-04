/**
 * Webhook 業務處理器
 *
 * 職責：
 * - 處理 Webhook 通知後的業務邏輯
 * - 更新訂單狀態
 * - 授予使用者權益
 * - 記錄訂閱扣款
 *
 * 設計理念：
 * - 這是「業務邏輯層」，不處理金流驗證
 * - 金流驗證和解析由 WebhookHandler 負責
 * - 這個 Processor 專注於「驗證通過後該做什麼」
 *
 * 使用範例：
 *   const processor = new WebhookProcessor(database, products);
 *   await processor.processPayment(parsedData, queryData);
 */

import logger from "../utils/logger.js";

export class WebhookProcessor {
  /**
   * 初始化 Webhook 業務處理器
   *
   * @param {Database} database - 資料庫實例
   * @param {Array<Object>} products - 商品清單
   *
   * @example
   * const processor = new WebhookProcessor(db, products);
   */
  constructor(database, products) {
    if (!database) {
      throw new Error("WebhookProcessor 需要 database 實例");
    }
    if (!products || !Array.isArray(products)) {
      throw new Error("WebhookProcessor 需要 products 陣列");
    }

    this.db = database;
    this.products = products;

    logger.info("WebhookProcessor 已初始化");
  }

  // ========================================
  // 主要處理流程
  // ========================================

  /**
   * 處理支付成功的業務邏輯
   *
   * 完整流程：
   * 1. 驗證金額一致性
   * 2. 更新訂單狀態
   * 3. 授予使用者權益（非關鍵，失敗不阻擋）
   * 4. 記錄訂閱扣款（如果是訂閱制）
   *
   * @param {Object} parsedData - 解析後的 Webhook 資料
   * @param {Object} queryData - 查詢 API 得到的訂單資料
   * @returns {Promise<Object>} 處理結果
   * @returns {boolean} 返回.success - 是否成功
   * @returns {string} 返回.message - 結果訊息
   *
   * @example
   * const result = await processor.processPayment(parsedData, queryData);
   * if (result.success) {
   *   console.log('處理成功');
   * }
   */
  async processPayment(parsedData, queryData) {
    try {
      const tradeNo = parsedData.MerTradeNo;
      const isPeriod = parsedData.PeriodAmt > 0 || parsedData.PeriodTradeNo;

      logger.info("開始處理支付業務邏輯", {
        tradeNo,
        isPeriod,
        status: queryData.tradeStatusText,
      });

      // 步驟 1: 驗證金額一致性
      const amountValidation = this._validateAmount(
        parsedData,
        queryData,
        tradeNo
      );
      if (!amountValidation.success) {
        return amountValidation;
      }

      // 步驟 2: 更新訂單狀態
      const updateResult = await this._updateOrderStatus(
        tradeNo,
        isPeriod,
        parsedData,
        queryData
      );
      if (!updateResult.success) {
        return updateResult;
      }

      // 步驟 3: 授予使用者權益（非關鍵，失敗不阻擋）
      try {
        await this._grantEntitlements(
          tradeNo,
          isPeriod,
          parsedData,
          queryData
        );
      } catch (entitlementError) {
        logger.error("授予權益時發生錯誤（不阻擋主流程）", {
          tradeNo,
          errorMessage: entitlementError.message,
        });
        // 不阻擋 webhook 回應，因為訂單已更新成功
      }

      logger.info("支付業務邏輯處理成功", {
        tradeNo,
        status: queryData.tradeStatusText,
        amount: queryData.amount,
      });

      return {
        success: true,
        message: "支付處理成功",
        data: {
          tradeNo,
          status: queryData.tradeStatusText,
          amount: queryData.amount,
        },
      };
    } catch (error) {
      logger.error("處理支付業務邏輯失敗", {
        errorMessage: error.message,
      });
      return {
        success: false,
        message: "處理失敗",
      };
    }
  }

  // ========================================
  // 私有方法 - 驗證
  // ========================================

  /**
   * 驗證金額一致性
   * @private
   */
  _validateAmount(parsedData, queryData, tradeNo) {
    const webhookAmount = parseInt(parsedData.TradeAmt || parsedData.PeriodAmt);
    const queryAmount = parseInt(queryData.amount);

    if (queryAmount !== webhookAmount) {
      logger.error("❌ Webhook 回調金額與查詢 API 不符", {
        tradeNo,
        webhookAmount,
        queryAmount,
      });
      return {
        success: false,
        message: "金額驗證失敗",
      };
    }

    logger.info("✓ 金額驗證通過", {
      tradeNo,
      amount: queryAmount,
    });

    return {
      success: true,
    };
  }

  // ========================================
  // 私有方法 - 訂單更新
  // ========================================

  /**
   * 更新訂單狀態
   * @private
   */
  async _updateOrderStatus(tradeNo, isPeriod, parsedData, queryData) {
    try {
      // 建立更新資料
      const updateData = this._buildUpdateData(
        tradeNo,
        isPeriod,
        parsedData,
        queryData
      );

      // 更新資料庫
      const updateSuccess = await this.db.updateOrder(updateData);

      if (!updateSuccess) {
        logger.error("❌ 更新訂單失敗", { tradeNo });
        return {
          success: false,
          message: "更新訂單失敗",
        };
      }

      logger.info("✓ 訂單狀態已更新", {
        tradeNo: updateData.MerTradeNo,
        status: updateData.Status,
      });

      return {
        success: true,
      };
    } catch (error) {
      logger.error("更新訂單異常", {
        tradeNo,
        error: error.message,
      });
      return {
        success: false,
        message: "更新訂單異常",
      };
    }
  }

  /**
   * 建立訂單更新資料
   * @private
   */
  _buildUpdateData(tradeNo, isPeriod, parsedData, queryData) {
    return {
      MerTradeNo: isPeriod ? `${tradeNo.split("_")[0]}_0` : tradeNo,
      TradeSeq: queryData.tradeNo,
      Status: queryData.tradeStatusText,
      PeriodTradeNo: parsedData.PeriodTradeNo || "",
      PaymentMethod:
        queryData.paymentMethod || queryData.cardBankName || "信用卡",
      rawData: {
        ...parsedData,
        ...queryData,
      },
    };
  }

  // ========================================
  // 私有方法 - 權益授予
  // ========================================

  /**
   * 授予使用者權益
   * @private
   */
  async _grantEntitlements(tradeNo, isPeriod, parsedData, queryData) {
    // 訂閱制需要轉換訂單號：_1、_2... -> _0 (原始訂單)
    const searchTradeNo = isPeriod
      ? `${tradeNo.split("_")[0]}_0`
      : tradeNo;

    logger.info("準備授予權益", {
      originalTradeNo: tradeNo,
      searchTradeNo,
      isPeriod,
    });

    // 查詢訂單
    const order = await this.db.getOrderByTradeNo(searchTradeNo);
    if (!order) {
      logger.warn("無法授予權益：找不到訂單", {
        originalTradeNo: tradeNo,
        searchTradeNo,
      });
      return;
    }

    // 查詢商品
    const product = this.products.find((p) => p.id === order.productID);
    if (!product) {
      logger.warn("無法授予權益：找不到商品", {
        productId: order.productID,
      });
      return;
    }

    // 查詢使用者
    const user = await this.db.findUserByEmail(order.email);
    if (!user) {
      logger.warn("無法授予權益：找不到使用者", {
        email: order.email,
      });
      return;
    }

    // 授予權益
    await this.db.grantEntitlement(user.googleId, product, searchTradeNo);
    logger.info("✓ 權益已授予", {
      userId: user.googleId,
      productId: product.id,
      tradeNo: searchTradeNo,
    });

    // 記錄訂閱扣款（如果是訂閱制）
    if (isPeriod) {
      await this._recordPeriodPayment(
        tradeNo,
        searchTradeNo,
        parsedData,
        queryData
      );
    }
  }

  /**
   * 記錄訂閱扣款
   * @private
   */
  async _recordPeriodPayment(tradeNo, searchTradeNo, parsedData, queryData) {
    try {
      const periodTradeNo = parsedData.PeriodTradeNo || "";
      const sequenceMatch = tradeNo.match(/_(\d+)$/);
      const sequenceNo = sequenceMatch ? parseInt(sequenceMatch[1]) : 0;

      await this.db.recordPeriodPayment({
        periodTradeNo: periodTradeNo,
        baseOrderNo: searchTradeNo,
        sequenceNo: sequenceNo,
        tradeSeq: queryData.tradeNo,
        amount: queryData.amount,
        status: queryData.tradeStatusText,
        paymentTime: queryData.paymentDay || new Date().toISOString(),
        remark: JSON.stringify({
          isPaid: queryData.isPaid,
          message: queryData.message,
        }),
      });

      logger.info("✓ 訂閱扣款已記錄", {
        periodTradeNo,
        sequenceNo,
        amount: queryData.amount,
      });
    } catch (error) {
      logger.error("記錄訂閱扣款失敗", {
        tradeNo,
        error: error.message,
      });
      // 不拋出異常，允許主流程繼續
    }
  }
}

/**
 * 建立 WebhookProcessor 實例的工廠函數
 *
 * @param {Database} database - 資料庫實例
 * @param {Array<Object>} products - 商品清單
 * @returns {WebhookProcessor} WebhookProcessor 實例
 *
 * @example
 * import { getDatabase } from './database/provider.js';
 * import { createWebhookProcessor } from './webhook-processor.js';
 *
 * const db = getDatabase();
 * const processor = createWebhookProcessor(db, products);
 */
export function createWebhookProcessor(database, products) {
  return new WebhookProcessor(database, products);
}

export default WebhookProcessor;
