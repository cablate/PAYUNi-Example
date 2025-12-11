/**
 * Payuni 金流閘道
 *
 * 職責：
 * - 統一封裝所有與 Payuni 金流商的對接邏輯
 * - 提供清晰的介面給上層業務邏輯使用
 * - 隱藏 Payuni SDK 的實作細節
 *
 * 設計理念：
 * - 這是「金流商邏輯」，不是「業務邏輯」
 * - 未來如果要支援其他金流商（綠界、藍新），可以建立類似的 Gateway
 * - 業務層不應該直接調用 PayuniSDK，而是透過這個 Gateway
 *
 * 使用範例：
 *   const gateway = new PayuniGateway(sdk);
 *   const paymentData = gateway.createPayment(order, returnUrl);
 *   const isValid = gateway.verifyWebhook(webhookData);
 *   const parsedData = gateway.parseWebhook(webhookData);
 */

import logger from "@/utils/logger";

interface PayuniSDK {
  generatePaymentInfo(
    tradeNo: string,
    product: any,
    userEmail: string,
    returnUrl: string
  ): { payUrl: string; data: any };
  generatePeriodPaymentInfo(
    tradeNo: string,
    product: any,
    userEmail: string,
    returnUrl: string
  ): { payUrl: string; data: any };
  verifyWebhookData(encryptInfo: string, hashInfo: string): boolean;
  parseWebhookData(encryptInfo: string): any;
  queryTradeStatus(tradeNo: string): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }>;
  queryPeriodStatus(periodTradeNo: string): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }>;
  cancelPeriodPayment(periodTradeNo: string): Promise<{
    success: boolean;
    error?: string;
  }>;
  modifyPeriodStatus(options: {
    reviseTradeStatus: string;
    periodTradeNo: string;
    merTradeNo?: string;
    periodOrderNo?: number | string;
  }): Promise<{
    success: boolean;
    error?: string;
  }>;
}

interface Order {
  tradeNo: string;
  product: {
    id?: string;
    name: string;
    price: number;
    periodConfig?: {
      periodType: string;
      periodTimes: number;
    };
  };
  userEmail: string;
}

interface WebhookData {
  EncryptInfo: string;
  HashInfo: string;
}

interface PaymentResult {
  payUrl: string;
  data: any;
}

interface QueryResult {
  success: boolean;
  data?: any;
  error?: string;
}

interface ModifyOptions {
  reviseTradeStatus: string;
  periodTradeNo: string;
  merTradeNo?: string;
  periodOrderNo?: number | string;
}

export class PayuniGateway {
  private sdk: PayuniSDK;

  /**
   * 初始化金流閘道
   * @param {PayuniSDK} sdk - PayuniSDK 實例
   */
  constructor(sdk: PayuniSDK) {
    if (!sdk) {
      throw new Error("PayuniGateway 需要 PayuniSDK 實例");
    }
    this.sdk = sdk;
    logger.info("PayuniGateway 已初始化");
  }

  // ========================================
  // 支付相關
  // ========================================

  /**
   * 建立一次性支付
   *
   * @param {Object} order - 訂單物件
   * @param {string} order.tradeNo - 訂單編號
   * @param {Object} order.product - 商品資訊 { id, name, price }
   * @param {string} order.userEmail - 使用者 Email
   * @param {string} returnUrl - 支付完成後的返回 URL
   * @returns {Object} { payUrl, data } 支付表單資料
   *
   * @example
   * const paymentData = gateway.createPayment({
   *   tradeNo: 'ORDER123',
   *   product: { name: '課程', price: 2999 },
   *   userEmail: 'user@example.com'
   * }, 'https://example.com/payment-return');
   */
  createPayment(order: Order, returnUrl: string): PaymentResult {
    try {
      const { tradeNo, product, userEmail } = order;

      // 驗證必要欄位
      this._validatePaymentRequest(tradeNo, product, userEmail);

      // 調用 SDK 生成支付資訊
      const paymentInfo = this.sdk.generatePaymentInfo(
        tradeNo,
        product,
        userEmail,
        returnUrl
      );

      logger.info("一次性支付資料已生成", {
        tradeNo,
        productName: product.name,
        amount: product.price,
      });

      return {
        payUrl: paymentInfo.payUrl,
        data: paymentInfo.data,
      };
    } catch (error: any) {
      logger.error("建立一次性支付失敗", {
        tradeNo: order.tradeNo,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * 建立訂閱支付
   *
   * @param {Object} order - 訂單物件
   * @param {string} order.tradeNo - 訂單編號（訂閱用，不含 _0 後綴）
   * @param {Object} order.product - 商品資訊，必須包含 periodConfig
   * @param {string} order.userEmail - 使用者 Email
   * @param {string} returnUrl - 支付完成後的返回 URL
   * @returns {Object} { payUrl, data } 支付表單資料
   *
   * @example
   * const subscriptionData = gateway.createSubscription({
   *   tradeNo: 'ORDER123',
   *   product: {
   *     name: '月訂閱',
   *     price: 299,
   *     periodConfig: { periodType: 'M', periodTimes: 12 }
   *   },
   *   userEmail: 'user@example.com'
   * }, 'https://example.com/payment-return');
   */
  createSubscription(order: Order, returnUrl: string): PaymentResult {
    try {
      const { tradeNo, product, userEmail } = order;

      // 驗證必要欄位
      this._validatePaymentRequest(tradeNo, product, userEmail);

      // 驗證訂閱配置
      if (!product.periodConfig) {
        throw new Error("商品缺少 periodConfig 配置");
      }

      // 調用 SDK 生成訂閱支付資訊
      const periodPaymentInfo = this.sdk.generatePeriodPaymentInfo(
        tradeNo,
        product,
        userEmail,
        returnUrl
      );

      logger.info("訂閱支付資料已生成", {
        tradeNo,
        productName: product.name,
        amount: product.price,
        periodType: product.periodConfig.periodType,
        periodTimes: product.periodConfig.periodTimes,
      });

      return {
        payUrl: periodPaymentInfo.payUrl,
        data: periodPaymentInfo.data,
      };
    } catch (error: any) {
      logger.error("建立訂閱支付失敗", {
        tradeNo: order.tradeNo,
        error: error.message,
      });
      throw error;
    }
  }

  // ========================================
  // Webhook 相關
  // ========================================

  /**
   * 驗證 Webhook 資料的完整性
   *
   * @param {Object} webhookData - Webhook 原始資料
   * @param {string} webhookData.EncryptInfo - 加密資料
   * @param {string} webhookData.HashInfo - 雜湊簽章
   * @returns {boolean} 驗證結果
   *
   * @example
   * const isValid = gateway.verifyWebhook(req.body);
   * if (!isValid) {
   *   return res.status(400).send('驗證失敗');
   * }
   */
  verifyWebhook(webhookData: WebhookData): boolean {
    try {
      const { EncryptInfo, HashInfo } = webhookData;

      if (!EncryptInfo || !HashInfo) {
        logger.warn("Webhook 資料缺少必要欄位", {
          hasEncryptInfo: !!EncryptInfo,
          hasHashInfo: !!HashInfo,
        });
        return false;
      }

      // 調用 SDK 驗證
      const isValid = this.sdk.verifyWebhookData(EncryptInfo, HashInfo);

      if (!isValid) {
        logger.warn("Webhook Hash 驗證失敗");
        return false;
      }

      logger.info("Webhook 驗證成功");
      return true;
    } catch (error: any) {
      logger.error("Webhook 驗證異常", { error: error.message });
      return false;
    }
  }

  /**
   * 解析 Webhook 資料
   *
   * @param {Object} webhookData - Webhook 原始資料
   * @param {string} webhookData.EncryptInfo - 加密資料
   * @returns {Object} 解密後的交易資料
   *
   * @example
   * const parsedData = gateway.parseWebhook(req.body);
   * console.log(parsedData.MerTradeNo, parsedData.Status);
   */
  parseWebhook(webhookData: WebhookData): any {
    try {
      const { EncryptInfo } = webhookData;

      if (!EncryptInfo) {
        throw new Error("Webhook 資料缺少 EncryptInfo");
      }

      // 調用 SDK 解密
      const parsedData = this.sdk.parseWebhookData(EncryptInfo);

      logger.info("Webhook 資料已解析", {
        tradeNo: parsedData.MerTradeNo,
        status: parsedData.Status,
      });

      return parsedData;
    } catch (error: any) {
      logger.error("解析 Webhook 資料失敗", { error: error.message });
      throw error;
    }
  }

  /**
   * 驗證並解析 Webhook（便利方法）
   *
   * 結合驗證和解析的便利方法，失敗返回 null
   *
   * @param {Object} webhookData - Webhook 原始資料
   * @returns {Object|null} 解密後的資料，驗證失敗返回 null
   *
   * @example
   * const data = gateway.verifyAndParseWebhook(req.body);
   * if (!data) {
   *   return res.status(400).send('驗證失敗');
   * }
   */
  verifyAndParseWebhook(webhookData: WebhookData): any | null {
    try {
      // 先驗證
      if (!this.verifyWebhook(webhookData)) {
        return null;
      }

      // 再解析
      return this.parseWebhook(webhookData);
    } catch (error: any) {
      logger.error("驗證並解析 Webhook 失敗", { error: error.message });
      return null;
    }
  }

  // ========================================
  // 查詢相關
  // ========================================

  /**
   * 查詢訂單狀態（主動確認支付）
   *
   * @param {string} tradeNo - 商店訂單編號
   * @returns {Promise<Object>} 查詢結果
   * @returns {boolean} 返回.success - 是否成功
   * @returns {Object} [返回.data] - 訂單資料（成功時）
   * @returns {string} [返回.error] - 錯誤訊息（失敗時）
   *
   * @example
   * const result = await gateway.queryOrderStatus('ORDER123');
   * if (result.success && result.data.isPaid) {
   *   // 訂單已支付
   * }
   */
  async queryOrderStatus(tradeNo: string): Promise<QueryResult> {
    try {
      if (!tradeNo) {
        throw new Error("缺少訂單編號");
      }

      logger.info("正在查詢訂單狀態", { tradeNo });

      // 調用 SDK 查詢
      const queryResult = await this.sdk.queryTradeStatus(tradeNo);

      if (!queryResult.success) {
        logger.warn("查詢訂單失敗", {
          tradeNo,
          error: queryResult.error,
        });
        return {
          success: false,
          error: queryResult.error || "查詢失敗",
        };
      }

      logger.info("訂單查詢成功", {
        tradeNo,
        status: queryResult.data.tradeStatusText,
        isPaid: queryResult.data.isPaid,
        amount: queryResult.data.amount,
      });

      return {
        success: true,
        data: queryResult.data,
      };
    } catch (error: any) {
      logger.error("查詢訂單異常", {
        tradeNo,
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 查詢續期訂單狀態
   *
   * @param {string} periodTradeNo - 續期交易編號
   * @returns {Promise<Object>} 查詢結果
   * @returns {boolean} 返回.success - 是否成功
   * @returns {Object} [返回.data] - 續期訂單資料（成功時）
   * @returns {string} [返回.error] - 錯誤訊息（失敗時）
   *
   * @example
   * const result = await gateway.queryPeriodStatus('20251205095722shT2cG');
   * if (result.success && result.data.isPaid) {
   *   // 續期扣款成功
   *   console.log(`第 ${result.data.thisPeriod}/${result.data.totalTimes} 期`);
   *   console.log(`下次扣款日期: ${result.data.nextAuthDate}`);
   * }
   */
  async queryPeriodStatus(periodTradeNo: string): Promise<QueryResult> {
    try {
      if (!periodTradeNo) {
        throw new Error("缺少續期交易編號");
      }

      logger.info("正在查詢續期訂單狀態", { periodTradeNo });

      // 調用 SDK 查詢
      const queryResult = await this.sdk.queryPeriodStatus(periodTradeNo);

      if (!queryResult.success) {
        logger.warn("查詢續期訂單失敗", {
          periodTradeNo,
          error: queryResult.error,
        });
        return {
          success: false,
          error: queryResult.error || "查詢失敗",
        };
      }

      logger.info("續期訂單查詢成功", {
        periodTradeNo,
        status: queryResult.data.status,
        isPaid: queryResult.data.isPaid,
        authAmt: queryResult.data.authAmt,
        thisPeriod: queryResult.data.thisPeriod,
        totalTimes: queryResult.data.totalTimes,
      });

      return {
        success: true,
        data: queryResult.data,
      };
    } catch (error: any) {
      logger.error("查詢續期訂單異常", {
        periodTradeNo,
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 取消訂閱（續期收款）
   *
   * @param {string} periodTradeNo - 續期收款單號
   * @returns {Promise<Object>} 取消結果
   *
   * @example
   * const result = await gateway.cancelSubscription('PAY202511...');
   * if (result.success) {
   *   // 取消成功
   * }
   */
  async cancelSubscription(periodTradeNo: string): Promise<QueryResult> {
    try {
      if (!periodTradeNo) {
        throw new Error("缺少續期收款單號");
      }

      logger.info("正在取消訂閱", { periodTradeNo });

      // 調用 SDK 取消
      const cancelResult = await this.sdk.cancelPeriodPayment(periodTradeNo);

      if (!cancelResult.success) {
        logger.warn("取消訂閱失敗", {
          periodTradeNo,
          error: cancelResult.error,
        });
        return cancelResult;
      }

      logger.info("訂閱已取消", { periodTradeNo });
      return cancelResult;
    } catch (error: any) {
      logger.error("取消訂閱異常", {
        periodTradeNo,
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 修改訂閱狀態
   *
   * @param {Object} options - 修改選項
   * @param {string} options.reviseTradeStatus - 狀態：suspend/restart/end/reauth
   * @param {string} options.periodTradeNo - 續期收款單號
   * @param {string} [options.merTradeNo] - 商店訂單編號
   * @param {number|string} [options.periodOrderNo] - 期數編號
   * @returns {Promise<Object>} 修改結果
   *
   * @example
   * const result = await gateway.modifySubscriptionStatus({
   *   reviseTradeStatus: 'suspend',
   *   periodTradeNo: 'PAY202511...'
   * });
   */
  async modifySubscriptionStatus(options: ModifyOptions): Promise<QueryResult> {
    try {
      logger.info("正在修改訂閱狀態", options);

      // 調用 SDK 修改
      const modifyResult = await this.sdk.modifyPeriodStatus(options);

      if (!modifyResult.success) {
        logger.warn("修改訂閱狀態失敗", {
          ...options,
          error: modifyResult.error,
        });
        return modifyResult;
      }

      logger.info("訂閱狀態已修改", options);
      return modifyResult;
    } catch (error: any) {
      logger.error("修改訂閱狀態異常", {
        ...options,
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // ========================================
  // 私有方法
  // ========================================

  /**
   * 驗證支付請求的必要欄位
   * @private
   */
  private _validatePaymentRequest(
    tradeNo: string,
    product: { name: string; price: number },
    userEmail: string
  ): void {
    if (!tradeNo) {
      throw new Error("缺少訂單編號");
    }

    if (!product || !product.name || !product.price) {
      throw new Error("商品資訊不完整");
    }

    if (!userEmail) {
      throw new Error("缺少使用者 Email");
    }
  }
}

/**
 * 建立 PayuniGateway 實例的工廠函數
 *
 * @param {PayuniSDK} sdk - PayuniSDK 實例
 * @returns {PayuniGateway} PayuniGateway 實例
 *
 * @example
 * import { getPayuniSDK } from './provider.js';
 * import { createPayuniGateway } from './payuni-gateway.js';
 *
 * const sdk = getPayuniSDK();
 * const gateway = createPayuniGateway(sdk);
 */
export function createPayuniGateway(sdk: PayuniSDK): PayuniGateway {
  return new PayuniGateway(sdk);
}

export default PayuniGateway;
