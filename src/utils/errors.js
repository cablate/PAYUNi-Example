/**
 * 自定義錯誤類別 - 用於支付相關錯誤處理
 */
export class PaymentError extends Error {
  constructor(statusCode, message, context = {}) {
    super(message);
    this.name = 'PaymentError';
    this.statusCode = statusCode;
    this.context = context;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 常見錯誤快捷方式 - 所有訊息使用繁體中文
 */
export const PaymentErrors = {
  /**
   * 未授權錯誤 (401)
   * 使用者未登入或認證失敗
   */
  Unauthorized: (message = '請先登入後再操作') =>
    new PaymentError(401, message),

  /**
   * 錯誤的請求 (400)
   * 請求參數不正確或格式有誤
   */
  BadRequest: (message = '請求參數錯誤', context = {}) =>
    new PaymentError(400, message, context),

  /**
   * 資源不存在 (404)
   * 查詢的資源無法找到
   */
  NotFound: (message = '找不到指定資源', context = {}) =>
    new PaymentError(404, message, context),

  /**
   * 伺服器錯誤 (500)
   * 伺服器處理請求時發生未預期的錯誤
   */
  ServerError: (message = '伺服器處理失敗', context = {}) =>
    new PaymentError(500, message, context),

  /**
   * 安全驗證失敗 (400)
   * Turnstile 機器人驗證失敗
   */
  TurnstileVerificationFailed: () =>
    new PaymentError(400, '安全驗證失敗，請重新嘗試'),

  /**
   * 商品不存在 (404)
   * 指定的商品編號不存在於系統中
   */
  ProductNotFound: (productId) =>
    new PaymentError(404, '找不到該商品', { productId }),

  /**
   * 訂單已支付 (409)
   * 訂單已完成支付，無法重複付款
   */
  OrderAlreadyPaid: (tradeNo) =>
    new PaymentError(409, '訂單已支付，無法重複操作', { tradeNo }),

  /**
   * Webhook 簽章驗證失敗 (401)
   * PAYUNi 回調資料簽章驗證失敗，可能為偽造請求
   */
  InvalidWebhookSignature: () =>
    new PaymentError(401, 'Webhook 簽章驗證失敗'),

  /**
   * 訂閱商品配置錯誤 (400)
   * 訂閱商品缺少必要的配置資訊
   */
  InvalidSubscriptionConfig: (productId) =>
    new PaymentError(400, '訂閱商品配置不完整', { productId }),

  /**
   * 金額驗證失敗 (400)
   * 支付金額與訂單金額不符
   */
  AmountMismatch: (expected, actual) =>
    new PaymentError(400, '支付金額與訂單不符', { expected, actual }),

  /**
   * 訂單查詢失敗 (500)
   * 無法從支付提供商查詢訂單狀態
   */
  OrderQueryFailed: (tradeNo) =>
    new PaymentError(500, '無法查詢訂單狀態，請稍後重試', { tradeNo }),
};
