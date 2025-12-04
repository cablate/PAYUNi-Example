import { PaymentError } from "@/utils/errors";
import logger from "@/utils/logger";
import type { Request, Response, NextFunction } from "express";

/**
 * 全局錯誤處理中間件
 * 統一處理所有路由拋出的錯誤
 */
export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction): void {
  // 處理自定義支付錯誤
  if (err instanceof PaymentError) {
    logger.error("支付錯誤", {
      errorMessage: err.message,
      statusCode: err.statusCode,
      context: err.context,
      path: req.path,
      method: req.method,
    });

    // 生產環境隱藏詳細錯誤訊息
    const message = process.env.NODE_ENV === "production"
      ? "系統處理異常，請稍後再試"
      : err.message;

    res.status(err.statusCode).json({
      error: message,
      ...(process.env.NODE_ENV !== "production" && { context: err.context }),
    });
    return;
  }

  // 處理 express-validator 錯誤
  if (err.array && typeof err.array === 'function') {
    logger.warn("驗證錯誤", { validationErrors: err.array() });
    res.status(400).json({
      error: "輸入資料不正確",
      details: err.array().map((e: any) => e.msg),
    });
    return;
  }

  // 未預期的錯誤
  logger.error("未預期的錯誤", {
    errorMessage: err.message,
    stack: err.stack,
    path: req.path,
  });

  res.status(500).json({
    error: process.env.NODE_ENV === "production"
      ? "系統處理異常，請稍後再試"
      : err.message,
  });
}
