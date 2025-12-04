/**
 * Webhook 處理服務
 *
 * 職責：
 * - 驗證 Webhook 資料的完整性（Hash 驗證）
 * - 解析加密的 Webhook 資料
 * - 查詢金流商 API 確認支付狀態
 * - 協調業務邏輯處理（委派給 WebhookProcessor）
 *
 * 設計理念：
 * - 這是「金流驗證層」+ 「流程協調層」
 * - 只負責金流相關的驗證和解析，不處理業務邏輯
 * - 業務邏輯（更新訂單、授予權益）由 WebhookProcessor 處理
 * - 遵循「單一職責原則」，職責清晰
 *
 * 使用範例：
 *   const handler = new WebhookHandler(gateway, processor);
 *   const result = await handler.processWebhook(webhookBody);
 */

import logger from "../../utils/logger";

interface PaymentGateway {
  verifyWebhook(webhookData: WebhookData): boolean;
  parseWebhook(webhookData: WebhookData): any;
  queryOrderStatus(tradeNo: string): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }>;
}

interface WebhookProcessor {
  processPayment(parsedData: any, queryData: any): Promise<{
    success: boolean;
    message: string;
    data?: any;
  }>;
}

interface WebhookData {
  EncryptInfo: string;
  HashInfo: string;
  Status: string;
}

interface ProcessResult {
  success: boolean;
  message: string;
  data?: any;
}

export class WebhookHandler {
  private gateway: PaymentGateway;
  private processor: WebhookProcessor;

  /**
   * 初始化 Webhook 處理器
   *
   * @param {PaymentGateway} paymentGateway - 金流閘道實例（用於驗證、解析、查詢）
   * @param {WebhookProcessor} webhookProcessor - 業務處理器實例（用於處理業務邏輯）
   *
   * @example
   * const handler = new WebhookHandler(gateway, processor);
   * const result = await handler.processWebhook(webhookBody);
   */
  constructor(paymentGateway: PaymentGateway, webhookProcessor: WebhookProcessor) {
    if (!paymentGateway) {
      throw new Error("WebhookHandler 需要 paymentGateway 實例");
    }
    if (!webhookProcessor) {
      throw new Error("WebhookHandler 需要 webhookProcessor 實例");
    }

    this.gateway = paymentGateway;
    this.processor = webhookProcessor;

    logger.info("WebhookHandler 已初始化");
  }

  /**
   * 處理 Payuni Webhook 通知
   *
   * 主要流程：
   * 1. 驗證 Webhook 資料（簽章驗證）
   * 2. 解析加密資料
   * 3. 查詢 Payuni API 確認支付狀態（以 API 為準，不信任 Webhook）
   * 4. 委派給 WebhookProcessor 處理業務邏輯
   *
   * 此方法實現了「強驗證」策略：即使 Webhook 資料看起來正確，
   * 仍會主動調用 API 查詢以確保資料真實性。
   *
   * @async
   * @param {Object} webhookData - Webhook 請求主體
   * @param {string} webhookData.EncryptInfo - Payuni 加密的交易資料
   * @param {string} webhookData.HashInfo - 雜湊簽章
   * @param {string} webhookData.Status - 交易狀態（SUCCESS 或其他）
   * @returns {Promise<Object>} 處理結果
   * @returns {boolean} 返回.success - 是否成功
   * @returns {string} 返回.message - 結果訊息
   * @returns {Object} [返回.data] - 成功時的資料（訂單號、狀態、金額）
   *
   * @throws 不會拋出異常，所有錯誤都會被捕捉並返回 success: false
   *
   * @example
   * const result = await handler.processWebhook({
   *   EncryptInfo: "...",
   *   HashInfo: "...",
   *   Status: "SUCCESS"
   * });
   *
   * if (result.success) {
   *   console.log(`訂單 ${result.data.tradeNo} 已處理`);
   * }
   */
  async processWebhook(webhookData: WebhookData): Promise<ProcessResult> {
    try {
      logger.info("接收 Webhook 通知", {
        status: webhookData.Status,
      });

      // 步驟 1: 驗證 Webhook 資料
      const validationResult = this._validateWebhookData(webhookData);
      if (!validationResult.success) {
        return validationResult;
      }

      const { parsedData, tradeNo } = validationResult.data!;

      // 步驟 2: 查詢金流商 API 確認狀態（不信任 Webhook，以 API 為準）
      const queryResult = await this._queryOrderStatus(tradeNo);
      if (!queryResult.success) {
        return queryResult;
      }

      const queryData = queryResult.data!;

      logger.info("✓ Webhook 驗證和查詢完成，準備處理業務邏輯", {
        tradeNo,
        status: queryData.tradeStatusText,
        amount: queryData.amount,
        isPaid: queryData.isPaid,
      });

      // 步驟 3: 委派給 WebhookProcessor 處理業務邏輯
      const processResult = await this.processor.processPayment(
        parsedData,
        queryData
      );

      if (!processResult.success) {
        logger.error("業務邏輯處理失敗", {
          tradeNo,
          error: processResult.message,
        });
        return processResult;
      }

      logger.info("✓ Webhook 處理完成", {
        tradeNo,
        status: queryData.tradeStatusText,
        amount: queryData.amount,
      });

      return {
        success: true,
        message: "Webhook 處理成功",
        data: {
          tradeNo,
          status: queryData.tradeStatusText,
          amount: queryData.amount,
        },
      };
    } catch (error: any) {
      logger.error("Webhook 處理異常", { errorMessage: error.message });
      return {
        success: false,
        message: "Webhook 處理失敗",
      };
    }
  }

  // ========================================
  // 私有方法 - 驗證與解析
  // ========================================

  /**
   * 驗證和解析 Webhook 資料
   * @private
   * @param {Object} webhookData - Webhook 資料
   * @returns {Object} 驗證結果
   */
  private _validateWebhookData(webhookData: WebhookData): ProcessResult {
    const { EncryptInfo, HashInfo, Status } = webhookData;

    // 檢查支付狀態
    if (Status !== "SUCCESS") {
      logger.warn("支付狀態不是 SUCCESS", { status: Status });
    }

    // 驗證 Hash（使用 Gateway）
    if (!this.gateway.verifyWebhook(webhookData)) {
      logger.warn("❌ Webhook 雜湊驗證失敗");
      return {
        success: false,
        message: "Webhook 雜湊驗證失敗",
      };
    }

    // 解密資料（使用 Gateway）
    let parsedData: any;
    try {
      parsedData = this.gateway.parseWebhook(webhookData);
    } catch (error: any) {
      logger.error("❌ 解析 Webhook 資料失敗", { error: error.message });
      return {
        success: false,
        message: "解析 Webhook 資料失敗",
      };
    }

    const tradeNo = parsedData.MerTradeNo;
    const tradeSeq = parsedData.TradeNo;
    const payStatus = parsedData.Status || "已完成";

    // 檢查訂單編號
    if (!tradeNo) {
      logger.warn("❌ Webhook 資料缺少商戶訂單編號");
      return {
        success: false,
        message: "Webhook 資料缺少商戶訂單編號",
      };
    }

    logger.info("✓ Webhook 驗證和解析通過", {
      tradeNo,
      tradeSeq,
      payStatus,
    });

    return {
      success: true,
      message: "Webhook 驗證成功",
      data: {
        parsedData,
        tradeNo,
        tradeSeq,
        payStatus,
      },
    };
  }

  /**
   * 查詢訂單狀態（主動確認支付）
   * @private
   * @param {string} tradeNo - 商戶訂單編號
   * @returns {Promise<Object>} 查詢結果
   */
  private async _queryOrderStatus(tradeNo: string): Promise<ProcessResult> {
    try {
      logger.info("正在查詢金流商 API 確認訂單狀態", { tradeNo });

      // 使用 Gateway 查詢
      const queryResult = await this.gateway.queryOrderStatus(tradeNo);

      if (!queryResult.success) {
        logger.error("❌ 查詢訂單失敗，放棄處理", {
          tradeNo,
          error: queryResult.error,
        });
        return {
          success: false,
          message: "查詢訂單失敗",
        };
      }

      logger.info("✓ API 查詢成功（以此為準）", {
        tradeNo,
        amount: queryResult.data.amount,
        status: queryResult.data.tradeStatusText,
        isPaid: queryResult.data.isPaid,
      });

      return {
        success: true,
        message: "查詢訂單成功",
        data: queryResult.data,
      };
    } catch (queryError: any) {
      logger.error("⚠️ 查詢訂單異常，放棄處理", {
        tradeNo,
        error: queryError.message,
      });
      return {
        success: false,
        message: "查詢訂單異常",
      };
    }
  }
}

/**
 * 建立 WebhookHandler 實例的工廠函數
 *
 * @param {PaymentGateway} paymentGateway - 金流閘道實例
 * @param {WebhookProcessor} webhookProcessor - 業務處理器實例
 * @returns {WebhookHandler} WebhookHandler 實例
 *
 * @example
 * import { createPayuniGateway } from './payment/payuni-gateway.js';
 * import { createWebhookProcessor } from './webhook-processor.js';
 * import { createWebhookHandler } from './webhook-handler.js';
 *
 * const gateway = createPayuniGateway(sdk);
 * const processor = createWebhookProcessor(db, products);
 * const handler = createWebhookHandler(gateway, processor);
 */
export function createWebhookHandler(
  paymentGateway: PaymentGateway,
  webhookProcessor: WebhookProcessor
): WebhookHandler {
  return new WebhookHandler(paymentGateway, webhookProcessor);
}

export default WebhookHandler;
