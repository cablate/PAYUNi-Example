import { Router } from "express";
import { getOrderDatabase } from "../services/database/provider.js";
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
      const db = getOrderDatabase();
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

    res.json({
    "status": "success",
    "tradeNo": "c9ea242c44b349e4bb25",
    "tradeSeq": "1763531335387919138",
    "payTime": "2025-11-19T05:48:56.571Z",
    "message": "授權成功"
})

    // if (resultData) {
    //   oneTimeTokens.delete(token);
    //   logger.info("Order result retrieved with token", { tradeNo: resultData.tradeNo });
    //   res.json(resultData);
    // } else {
    //   logger.warn("Invalid or expired token received", { token });
    //   res.status(404).json({ error: "無效或已過期的連結" });
    // }
  });

  return router;
}
