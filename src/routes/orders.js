import axios from "axios";
import { Router } from "express";
import { EXTERNAL_SERVICES } from "../config/constants.js";
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

      const gasResponse = await axios.post(
        `${EXTERNAL_SERVICES.GAS_WEBHOOK_URL}?action=getMyOrders`,
        { email: userEmail },
        {
          headers: {
            Cookie: `token=${EXTERNAL_SERVICES.WEBHOOK_TOKEN}`,
          },
        }
      );

      if (gasResponse.data && gasResponse.data.orders) {
        res.json({ success: true, orders: gasResponse.data.orders });
      } else {
        throw new Error(gasResponse.data.message || "無法從 GAS 獲取訂單");
      }
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
      logger.info("Order result retrieved with token", { tradeNo: resultData.tradeNo });
      res.json(resultData);
    } else {
      logger.warn("Invalid or expired token received", { token });
      res.status(404).json({ error: "無效或已過期的連結" });
    }
  });

  return router;
}
