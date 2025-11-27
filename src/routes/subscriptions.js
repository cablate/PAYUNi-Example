/**
 * 訂閱管理路由
 * 提供訂閱查詢、取消等功能
 */

import express from "express";
import { getDatabase } from "../services/database/provider.js";
import { getPayuniSDK } from "../services/payment/provider.js";
import logger from "../utils/logger.js";

const router = express.Router();

/**
 * GET /api/subscriptions
 * 查詢使用者所有訂閱
 */
router.get("/", async (req, res) => {
  try {
    if (!req.session?.user) {
      return res.status(401).json({ error: "請先登入" });
    }

    const userId = req.session.user.id;
    const db = getDatabase();

    // 取得所有權益（包含已取消的）
    const allEntitlements = await db.getUserEntitlements(userId);
    
    // 只回傳訂閱類型
    const subscriptions = allEntitlements.filter(e => e.type === "subscription");

    logger.info("查詢訂閱成功", { userId, count: subscriptions.length });
    return res.json({
      subscriptions,
      total: subscriptions.length,
    });
  } catch (error) {
    logger.error("查詢訂閱失敗", { error: error.message });
    return res.status(500).json({ error: "查詢訂閱失敗" });
  }
});

/**
 * POST /api/subscriptions/:periodTradeNo/cancel
 * 取消訂閱
 */
router.post("/:periodTradeNo/cancel", async (req, res) => {
  try {
    if (!req.session?.user) {
      return res.status(401).json({ error: "請先登入" });
    }

    const userId = req.session.user.id;
    const { periodTradeNo } = req.params;

    if (!periodTradeNo) {
      return res.status(400).json({ error: "缺少 periodTradeNo 參數" });
    }

    logger.info("開始取消訂閱", { userId, periodTradeNo });

    const db = getDatabase();

    // 1. 驗證 periodTradeNo 屬於該使用者
    const entitlements = await db.getUserEntitlements(userId);
    const subscription = entitlements.find(
      e => e.periodTradeNo === periodTradeNo && e.type === "subscription"
    );

    if (!subscription) {
      logger.warn("訂閱不屬於該使用者", { userId, periodTradeNo });
      return res.status(403).json({ error: "無權取消此訂閱" });
    }

    // 檢查是否已取消
    if (subscription.cancelledAt) {
      logger.warn("訂閱已被取消", { userId, periodTradeNo });
      return res.status(400).json({ 
        error: "訂閱已被取消",
        expiryDate: subscription.expiryDate,
      });
    }

    // 2. 調用 PayUNi API 修改狀態為 end
    const baseMerTradeNo = (subscription.sourceOrderId || subscription.merTradeNo || "").split("_")[0];
    const sdk = getPayuniSDK();
    const modifyResult = await sdk.modifyPeriodStatus({
      reviseTradeStatus: "end",
      periodTradeNo,
      merTradeNo: baseMerTradeNo || undefined,
    });

    if (!modifyResult.success) {
      logger.error("PayUNi 取消狀態失敗", {
        userId,
        periodTradeNo,
        error: modifyResult.error,
      });
      return res.status(500).json({
        error: "取消訂閱失敗",
        details: modifyResult.error,
      });
    }

    // 3. 更新資料庫 Entitlements
    const dbResult = await db.cancelSubscription(userId, periodTradeNo);

    if (!dbResult.success) {
      logger.error("資料庫更新失敗", {
        userId,
        periodTradeNo,
        error: dbResult.error,
      });
      return res.status(500).json({
        error: "取消訂閱失敗（資料庫錯誤）",
        details: dbResult.error,
      });
    }

    logger.info("訂閱取消成功", {
      userId,
      periodTradeNo,
      productId: dbResult.entitlement.productId,
    });

    return res.json({
      success: true,
      message: "訂閱已取消",
      entitlement: {
        productId: dbResult.entitlement.productId,
        expiryDate: dbResult.entitlement.expiryDate,
        note: "權益將維持到到期日",
      },
    });
  } catch (error) {
    logger.error("取消訂閱異常", {
      error: error.message,
      stack: error.stack,
    });
    return res.status(500).json({ error: "伺服器錯誤" });
  }
});

/**
 * POST /api/subscriptions/:periodTradeNo/status
 * 更新續期收款狀態 (suspend/restart/end/reauth)
 */
router.post("/:periodTradeNo/status", async (req, res) => {
  try {
    if (!req.session?.user) {
      return res.status(401).json({ error: "請先登入" });
    }

    const userId = req.session.user.id;
    const { periodTradeNo } = req.params;
    const { action, periodOrderNo, merTradeNo } = req.body;
    const validActions = ["suspend", "restart", "end", "reauth"];

    if (!periodTradeNo) {
      return res.status(400).json({ error: "缺少 periodTradeNo" });
    }

    if (!action || !validActions.includes(action)) {
      return res.status(400).json({ error: "action 參數錯誤，可選 suspend/restart/end/reauth" });
    }

    logger.info("準備修改訂閱狀態", { userId, periodTradeNo, action });

    const db = getDatabase();
    const entitlements = await db.getUserEntitlements(userId);
    const subscription = entitlements.find(
      (e) => e.periodTradeNo === periodTradeNo && e.type === "subscription"
    );

    if (!subscription) {
      logger.warn("無此訂閱或非使用者所有", { userId, periodTradeNo });
      return res.status(403).json({ error: "無權修改此訂閱" });
    }

    const sdk = getPayuniSDK();
    const modifyResult = await sdk.modifyPeriodStatus({
      reviseTradeStatus: action,
      periodTradeNo,
      merTradeNo: merTradeNo || subscription.sourceOrderId,
      periodOrderNo,
    });

    if (!modifyResult.success) {
      logger.error("修改訂閱狀態失敗", {
        userId,
        periodTradeNo,
        action,
        error: modifyResult.error,
      });
      return res.status(500).json({
        error: "修改訂閱狀態失敗",
        details: modifyResult.error,
      });
    }

    logger.info("訂閱狀態修改成功", {
      userId,
      periodTradeNo,
      action,
    });

    return res.json({
      success: true,
      message: modifyResult.message,
      data: modifyResult.data,
    });
  } catch (error) {
    logger.error("訂閱狀態修改異常", {
      error: error.message,
      stack: error.stack,
    });
    return res.status(500).json({ error: "伺服器錯誤" });
  }
});

export default router;
