import { Router } from "express";
import { getDatabase } from "../services/database/provider.js";
import logger from "../utils/logger.js";

/**
 * 安全錯誤處理工具函數
 */
function sendSecureError(res, statusCode, publicMessage, logContext = {}) {
  logger.error(publicMessage, logContext);

  if (process.env.NODE_ENV === "production") {
    return res.status(statusCode).json({
      error: "系統處理異常，請稍後再試",
      code: statusCode,
    });
  }

  return res.status(statusCode).json({
    error: publicMessage,
    ...logContext,
  });
}

/**
 * 建立訂單路由
 */
export function createOrderRoutes(oneTimeTokens) {
  const router = Router();

  /**
   * 取得我的訂單
   */
  router.get("/api/my-orders", async (req, res) => {
    if (!req.session.user) {
      return res.status(401).json({ error: "請先登入" });
    }

    try {
      const userEmail = req.session.user.email;
      const db = getDatabase();
      const orders = await db.getUserOrders(userEmail);
      res.json({ success: true, orders });
    } catch (error) {
      sendSecureError(res, 500, "查詢訂單失敗", { message: error.message });
    }
  });

  /**
   * 取得訂單結果（使用一次性權杖）
   */
  router.get("/api/order-result/:token", (req, res) => {
    const { token } = req.params;
    const resultData = oneTimeTokens.get(token);

    if (resultData) {
      oneTimeTokens.delete(token);
      logger.info("使用 token 檢索訂單結果", { tradeNo: resultData.tradeNo });
      res.json(resultData);
    } else {
      logger.warn("接收到無效或過期的 token", { token });
      res.status(404).json({ error: "無效或已過期的連結" });
    }
  });

  return router;
}
