import { PaymentError } from "../utils/errors.js";
import logger from "../utils/logger.js";

/**
 * 全局錯誤處理中間件
 * 統一處理所有路由拋出的錯誤
 */
export function errorHandler(err, req, res, next) {
  // 處理自定義支付錯誤
  if (err instanceof PaymentError) {
    logger.error(err.message, {
      statusCode: err.statusCode,
      context: err.context,
      path: req.path,
      method: req.method,
    });

    // 生產環境隱藏詳細錯誤訊息
    const message = process.env.NODE_ENV === "production" 
      ? "系統處理異常，請稍後再試" 
      : err.message;

    return res.status(err.statusCode).json({
      error: message,
      ...(process.env.NODE_ENV !== "production" && { context: err.context }),
    });
  }

  // 處理 express-validator 錯誤
  if (err.array && typeof err.array === 'function') {
    logger.warn("驗證錯誤", { errors: err.array() });
    return res.status(400).json({
      error: "輸入資料不正確",
      details: err.array().map(e => e.msg),
    });
  }

  // 未預期的錯誤
  logger.error("未預期的錯誤", {
    message: err.message,
    stack: err.stack,
    path: req.path,
  });

  res.status(500).json({
    error: process.env.NODE_ENV === "production" 
      ? "系統處理異常，請稍後再試" 
      : err.message,
  });
}
