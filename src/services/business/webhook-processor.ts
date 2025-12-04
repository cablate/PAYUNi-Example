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

import logger from "../../utils/logger";
import { PaymentErrors } from "../../utils/errors";

interface Database {
  updateOrder(updateData: any): Promise<boolean>;
  getOrderByTradeNo(tradeNo: string): Promise<any | null>;
  findUserByEmail(email: string): Promise<any | null>;
  grantEntitlement(userId: string, product: any, orderId: string): Promise<boolean>;
  recordPeriodPayment(paymentData: any): Promise<boolean>;
  recordFailedEntitlement(failureData: any): Promise<boolean>;
}

interface Product {
  id: string;
  name: string;
  price: number;
  type: string;
  periodConfig?: {
    periodType: string;
    periodTimes: number;
  };
}

interface ParsedData {
  MerTradeNo: string;
  TradeAmt?: number;
  PeriodAmt?: number;
  PeriodTradeNo?: string;
}

interface QueryData {
  amount: number;
  tradeStatusText: string;
  tradeNo: string;
  paymentMethod?: string;
  cardBankName?: string;
  isPaid: boolean;
  paymentDay?: string;
  message?: string;
}

interface ProcessResult {
  success: boolean;
  message: string;
  data?: any;
  errorCode?: string;
  isRetryable?: boolean;
  reason?: string;
}

export class WebhookProcessor {
  private db: Database;
  private products: Product[];

  /**
   * 初始化 Webhook 業務處理器
   *
   * @param {Database} database - 資料庫實例
   * @param {Array<Object>} products - 商品清單
   *
   * @example
   * const processor = new WebhookProcessor(db, products);
   */
  constructor(database: Database, products: Product[]) {
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
   * 3. 授予使用者權益（帶重試機制，失敗有補償）
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
  async processPayment(parsedData: ParsedData, queryData: QueryData): Promise<ProcessResult> {
    try {
      const tradeNo = parsedData.MerTradeNo;
      const isPeriod = (parsedData.PeriodAmt && parsedData.PeriodAmt > 0) || !!parsedData.PeriodTradeNo;

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

      // 步驟 3: 授予使用者權益（帶重試機制，失敗有補償）
      const entitlementResult = await this._grantEntitlementsWithRetry(
        tradeNo,
        isPeriod,
        parsedData,
        queryData
      );
      if (!entitlementResult.success) {
        logger.warn("⚠️ 授予權益失敗，已記錄補償任務", {
          tradeNo,
          reason: entitlementResult.reason,
        });
        // 訂單已更新，但記錄失敗供後續定期修復
      }

      logger.info("✓ 支付業務邏輯處理成功", {
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
    } catch (error: any) {
      logger.error("❌ 處理支付業務邏輯失敗", {
        errorMessage: error.message,
        errorCode: error.errorCode,
        isRetryable: error.isRetryable,
      });
      return {
        success: false,
        message: "處理失敗",
        errorCode: error.errorCode,
        isRetryable: error.isRetryable || false,
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
  private _validateAmount(parsedData: ParsedData, queryData: QueryData, tradeNo: string): ProcessResult {
    const webhookAmount = parseInt(String(parsedData.TradeAmt || parsedData.PeriodAmt || 0));
    const queryAmount = parseInt(String(queryData.amount));

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
      message: "金額驗證成功",
    };
  }

  // ========================================
  // 私有方法 - 訂單更新
  // ========================================

  /**
   * 更新訂單狀態
   * @private
   */
  private async _updateOrderStatus(
    tradeNo: string,
    isPeriod: boolean,
    parsedData: ParsedData,
    queryData: QueryData
  ): Promise<ProcessResult> {
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
        message: "訂單更新成功",
      };
    } catch (error: any) {
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
  private _buildUpdateData(
    tradeNo: string,
    isPeriod: boolean,
    parsedData: ParsedData,
    queryData: QueryData
  ): any {
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
  // 私有方法 - 權益授予（帶重試與補償）
  // ========================================

  /**
   * 授予權益（帶重試機制）
   * 失敗時會重試 3 次，最終失敗會記錄補償任務供後續修復
   * @private
   */
  private async _grantEntitlementsWithRetry(
    tradeNo: string,
    isPeriod: boolean,
    parsedData: ParsedData,
    queryData: QueryData
  ): Promise<ProcessResult> {
    const MAX_RETRIES = 3;
    let lastError: any;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await this._grantEntitlements(tradeNo, isPeriod, parsedData, queryData);

        logger.info(`✓ 權益授予成功（第 ${attempt} 次嘗試）`, { tradeNo });
        return {
          success: true,
          message: '授予成功',
          reason: '授予成功',
        };
      } catch (error: any) {
        lastError = error;
        logger.warn(
          `⚠️ 授予權益失敗（第 ${attempt}/${MAX_RETRIES} 次嘗試）`,
          {
            tradeNo,
            attempt,
            error: error.message,
          }
        );

        // 指數退避：1秒 → 2秒 → 4秒
        if (attempt < MAX_RETRIES) {
          const delayMs = 1000 * Math.pow(2, attempt - 1);
          await this._sleep(delayMs);
        }
      }
    }

    // 全部重試失敗，記錄補償任務
    logger.error(`❌ 權益授予失敗，已記錄補償任務`, {
      tradeNo,
      attempts: MAX_RETRIES,
      lastError: lastError?.message,
    });

    // 記錄失敗供後續定期修復任務處理
    try {
      await this.db.recordFailedEntitlement({
        tradeNo: isPeriod ? `${tradeNo.split("_")[0]}_0` : tradeNo,
        amount: queryData.amount,
        reason: lastError?.message || '未知錯誤',
        attempt: MAX_RETRIES,
        timestamp: new Date().toISOString(),
      });
    } catch (recordError: any) {
      logger.error("記錄補償任務失敗", {
        tradeNo,
        error: recordError.message,
      });
    }

    return {
      success: false,
      message: `重試失敗`,
      reason: `重試 ${MAX_RETRIES} 次後仍失敗: ${lastError?.message}`,
    };
  }

  /**
   * 授予使用者權益
   *
   * @private
   * @throws {PaymentError} 訂單不存在、商品不存在、使用者不存在時拋異常
   */
  private async _grantEntitlements(
    tradeNo: string,
    isPeriod: boolean,
    parsedData: ParsedData,
    queryData: QueryData
  ): Promise<void> {
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
      throw PaymentErrors.NotFound('找不到訂單', {
        tradeNo: searchTradeNo,
        originalTradeNo: tradeNo,
      });
    }

    // 查詢商品
    const product = this.products.find((p) => p.id === order.productID);
    if (!product) {
      throw PaymentErrors.NotFound('找不到商品', {
        productId: order.productID,
      });
    }

    // 查詢使用者
    const user = await this.db.findUserByEmail(order.email);
    if (!user) {
      throw PaymentErrors.NotFound('找不到使用者', {
        email: order.email,
      });
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
  private async _recordPeriodPayment(
    tradeNo: string,
    searchTradeNo: string,
    parsedData: ParsedData,
    queryData: QueryData
  ): Promise<void> {
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
    } catch (error: any) {
      logger.error("記錄訂閱扣款失敗", {
        tradeNo,
        error: error.message,
      });
      // 不拋出異常，允許主流程繼續
    }
  }

  /**
   * 睡眠延遲（用於重試的指數退避）
   * @private
   */
  private _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
export function createWebhookProcessor(database: Database, products: Product[]): WebhookProcessor {
  return new WebhookProcessor(database, products);
}

export default WebhookProcessor;
