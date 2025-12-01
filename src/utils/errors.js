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
 * 常見錯誤快捷方式
 */
export const PaymentErrors = {
  Unauthorized: (message = '請先登入後再操作') => 
    new PaymentError(401, message),
  
  BadRequest: (message = '請求參數錯誤', context = {}) => 
    new PaymentError(400, message, context),
  
  NotFound: (message = '找不到指定資源', context = {}) => 
    new PaymentError(404, message, context),
  
  ServerError: (message = '伺服器處理失敗', context = {}) => 
    new PaymentError(500, message, context),
  
  TurnstileVerificationFailed: () =>
    new PaymentError(400, 'Turnstile 驗證失敗'),
};
