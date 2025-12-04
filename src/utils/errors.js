/**
 * 自定義支付錯誤類別
 *
 * 用於表示支付流程中發生的錯誤。包含 HTTP 狀態碼、錯誤分類和重試策略。
 *
 * @extends Error
 *
 * @example
 * throw new PaymentError(
 *   400,
 *   '請求參數錯誤',
 *   { productId: 'invalid_id' },
 *   'VALIDATION_ERROR',
 *   false
 * );
 */
export class PaymentError extends Error {
  /**
   * 建立 PaymentError 實例
   *
   * @param {number} statusCode - HTTP 狀態碼（如 400、401、404、500）
   * @param {string} message - 錯誤訊息，用於向使用者顯示
   * @param {Object} [context={}] - 額外的上下文資訊，用於日誌記錄
   * @param {string} [errorCode='UNKNOWN_ERROR'] - 錯誤碼（用於分類和重試判斷）
   * @param {boolean} [isRetryable=false] - 是否可重試
   *
   * @example
   * const error = new PaymentError(
   *   500,
   *   'API 查詢失敗',
   *   { tradeNo: 'ORDER123' },
   *   'API_QUERY_FAILED',
   *   true // 可重試
   * );
   */
  constructor(statusCode, message, context = {}, errorCode = 'UNKNOWN_ERROR', isRetryable = false) {
    super(message);
    this.name = 'PaymentError';
    this.statusCode = statusCode;
    this.context = context;
    this.errorCode = errorCode;
    this.isRetryable = isRetryable;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 常見支付錯誤的快捷方式集合
 *
 * 提供預定義的錯誤建立器，用於在支付流程中快速拋出結構化的錯誤。
 * 區分可重試錯誤（如網路問題）和不可重試錯誤（如驗證失敗）。
 *
 * @namespace PaymentErrors
 *
 * @example
 * // 使用錯誤快捷方式
 * if (!user) {
 *   throw PaymentErrors.Unauthorized();
 * }
 * if (error.response?.status === 503) {
 *   throw PaymentErrors.ServiceUnavailable();
 * }
 */
export const PaymentErrors = {
  // ===== 驗證與授權（不可重試）=====

  /**
   * 未授權錯誤 (401) - 不可重試
   * 使用者未登入或認證失敗
   */
  Unauthorized: (message = '請先登入後再操作') =>
    new PaymentError(401, message, {}, 'UNAUTHORIZED', false),

  /**
   * 錯誤的請求 (400) - 不可重試
   * 請求參數不正確或格式有誤
   */
  BadRequest: (message = '請求參數錯誤', context = {}) =>
    new PaymentError(400, message, context, 'BAD_REQUEST', false),

  /**
   * 安全驗證失敗 (400) - 不可重試
   * Turnstile 機器人驗證失敗
   */
  TurnstileVerificationFailed: () =>
    new PaymentError(400, '安全驗證失敗，請重新嘗試', {}, 'TURNSTILE_FAILED', false),

  /**
   * Webhook 簽章驗證失敗 (401) - 不可重試
   * Payuni 回調資料簽章驗證失敗，可能為偽造請求
   */
  InvalidWebhookSignature: () =>
    new PaymentError(401, 'Webhook 簽章驗證失敗', {}, 'INVALID_WEBHOOK_SIGNATURE', false),

  // ===== 資源不存在（不可重試）=====

  /**
   * 資源不存在 (404) - 不可重試
   * 查詢的資源無法找到
   */
  NotFound: (message = '找不到指定資源', context = {}) =>
    new PaymentError(404, message, context, 'NOT_FOUND', false),

  /**
   * 商品不存在 (404) - 不可重試
   * 指定的商品編號不存在於系統中
   */
  ProductNotFound: (productId) =>
    new PaymentError(404, '找不到該商品', { productId }, 'PRODUCT_NOT_FOUND', false),

  /**
   * 訂單已支付 (409) - 不可重試
   * 訂單已完成支付，無法重複付款
   */
  OrderAlreadyPaid: (tradeNo) =>
    new PaymentError(409, '訂單已支付，無法重複操作', { tradeNo }, 'ORDER_ALREADY_PAID', false),

  /**
   * 訂閱商品配置錯誤 (400) - 不可重試
   * 訂閱商品缺少必要的配置資訊
   */
  InvalidSubscriptionConfig: (productId) =>
    new PaymentError(400, '訂閱商品配置不完整', { productId }, 'INVALID_SUBSCRIPTION_CONFIG', false),

  /**
   * 金額驗證失敗 (400) - 不可重試
   * 支付金額與訂單金額不符
   */
  AmountMismatch: (expected, actual) =>
    new PaymentError(400, '支付金額與訂單不符', { expected, actual }, 'AMOUNT_MISMATCH', false),

  // ===== 資料庫錯誤（可重試）=====

  /**
   * 資料庫連接失敗 (500) - 可重試
   * 無法連接到資料庫
   */
  DatabaseConnectionFailed: (context = {}) =>
    new PaymentError(500, '資料庫連接失敗，請稍後重試', context, 'DB_CONNECTION_FAILED', true),

  /**
   * 資料庫查詢失敗 (500) - 可重試
   * 資料庫查詢操作失敗
   */
  DatabaseQueryFailed: (context = {}) =>
    new PaymentError(500, '資料庫查詢失敗，請稍後重試', context, 'DB_QUERY_FAILED', true),

  /**
   * 資料庫更新失敗 (500) - 可重試
   * 資料庫更新操作失敗
   */
  DatabaseUpdateFailed: (context = {}) =>
    new PaymentError(500, '資料庫更新失敗，請稍後重試', context, 'DB_UPDATE_FAILED', true),

  // ===== API 相關錯誤（可重試）=====

  /**
   * 訂單查詢失敗 (500) - 可重試
   * 無法從支付提供商查詢訂單狀態（網路問題或提供商問題）
   */
  OrderQueryFailed: (tradeNo) =>
    new PaymentError(500, '無法查詢訂單狀態，請稍後重試', { tradeNo }, 'ORDER_QUERY_FAILED', true),

  /**
   * API 超時 (504) - 可重試
   * 支付提供商 API 響應超時
   */
  APITimeout: (context = {}) =>
    new PaymentError(504, 'API 服務暫時無法使用，請稍後重試', context, 'API_TIMEOUT', true),

  /**
   * 服務不可用 (503) - 可重試
   * 支付提供商或相關服務不可用
   */
  ServiceUnavailable: (context = {}) =>
    new PaymentError(503, '服務暫時不可用，請稍後重試', context, 'SERVICE_UNAVAILABLE', true),

  // ===== 一般伺服器錯誤（可重試）=====

  /**
   * 伺服器錯誤 (500) - 可重試
   * 伺服器處理請求時發生未預期的錯誤
   */
  ServerError: (message = '伺服器處理失敗，請稍後重試', context = {}) =>
    new PaymentError(500, message, context, 'INTERNAL_SERVER_ERROR', true),
};
