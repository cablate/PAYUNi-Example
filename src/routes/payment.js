import crypto from "crypto";
import { Router } from "express";
import { validationResult } from "express-validator";
import { v4 as uuidv4 } from "uuid";
import { ONE_TIME_TOKEN_EXPIRY, PAYUNI_CONFIG } from "../config/constants.js";
import {
    createOrderInGAS,
    decryptWebhookData,
    findExistingOrder,
    generatePaymentData,
    updateOrderInGAS,
    verifyTurnstile,
    verifyWebhookHash,
} from "../services/payment.js";
import logger from "../utils/logger.js";
import { createPaymentValidation } from "../utils/validators.js";

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
 * 建立支付路由
 */
export function createPaymentRoutes(paymentLimiter, oneTimeTokens, products) {
  const router = Router();

  /**
   * 建立支付訂單
   */
  router.post("/create-payment", paymentLimiter, createPaymentValidation, async (req, res) => {
    // 強制要求登入
    if (!req.session.user) {
      return res.status(401).json({ error: "請先登入後再操作" });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn("Validation failed", { errors: errors.array() });
      return res.status(400).json({
        error: "輸入資料不正確",
        details: errors.array().map((e) => e.msg),
      });
    }

    const userEmail = req.session.user.email;
    const { turnstileToken, productID } = req.body;

    // 查找商品
    const product = products.find((p) => p.id === productID);
    if (!product) {
      return res.status(404).json({ error: "找不到該商品" });
    }

    // 驗證 Turnstile
    try {
      const isValid = await verifyTurnstile(turnstileToken);
      if (!isValid) {
        return res.status(400).json({ error: "Turnstile verification failed" });
      }
    } catch (error) {
      return sendSecureError(res, 500, "Turnstile 驗證錯誤", { message: error.message });
    }

    // 查詢現有未完成訂單
    try {
      const existingOrder = await findExistingOrder(userEmail, product.id);
      if (existingOrder) {
        const returnUrl = PAYUNI_CONFIG.RETURN_URL;
        const paymentData = generatePaymentData(existingOrder.tradeNo, product, userEmail, returnUrl);
        return res.json(paymentData);
      }
    } catch (error) {
      logger.warn("Error checking existing order", { error: error.message });
    }

    // 生成新訂單編號
    const tradeNo = uuidv4().replace(/-/g, "").substring(0, 20);

    // 在 GAS 中建立訂單記錄
    const gasOrderData = {
      tradeNo,
      merID: PAYUNI_CONFIG.MERCHANT_ID,
      tradeAmt: product.price,
      email: userEmail,
      productID: product.id,
      productName: product.name,
      ...(req.session.user && {
        userGoogleId: req.session.user.id,
        userEmail: req.session.user.email,
        userName: req.session.user.name,
      }),
    };

    const gasSuccess = await createOrderInGAS(gasOrderData);
    if (!gasSuccess) {
      return sendSecureError(res, 500, "訂單建立失敗", { tradeNo });
    }

    // 生成支付資料
    try {
      const returnUrl = PAYUNI_CONFIG.RETURN_URL;
      const paymentData = generatePaymentData(tradeNo, product, userEmail, returnUrl);
      logger.info("Payment created successfully", { tradeNo, amount: product.price });
      return res.json(paymentData);
    } catch (error) {
      return sendSecureError(res, 500, "支付建立失敗", { tradeNo, message: error.message });
    }
  });

  /**
   * PAYUNi Webhook 通知
   */
  router.post("/payuni-webhook", async (req, res) => {
    try {
      logger.info("Received Payuni webhook notification");

      const { EncryptInfo, HashInfo, Status } = req.body;

      if (Status !== "SUCCESS") {
        logger.warn("Payment status is not SUCCESS", { status: Status });
      }

      // 驗證 Hash
      if (!verifyWebhookHash(EncryptInfo, HashInfo)) {
        return res.send("FAIL");
      }

      // 解密資料
      const parsedData = decryptWebhookData(EncryptInfo);
      const tradeNo = parsedData.MerTradeNo;
      const tradeSeq = parsedData.TradeNo;
      const payStatus = parsedData.Status || "已完成";

      if (!tradeNo) {
        logger.warn("Missing MerTradeNo in webhook data");
        return res.send("FAIL");
      }

      logger.info("Webhook verified", { tradeNo, tradeSeq, payStatus });

      // 更新訂單狀態
      const updateData = {
        MerTradeNo: tradeNo,
        TradeSeq: tradeSeq,
        Status: payStatus,
        rawData: parsedData,
      };

      const updateSuccess = await updateOrderInGAS(updateData);
      if (!updateSuccess) {
        return res.send("FAIL");
      }

      logger.info("Webhook processed successfully", { tradeNo, status: payStatus });
      res.send(Status === "SUCCESS" ? "OK" : "FAIL");
    } catch (error) {
      logger.error("Webhook processing error", { message: error.message });
      res.send("ERROR");
    }
  });

  /**
   * PAYUNi ReturnURL
   */
  router.post("/payment-return", async (req, res) => {
    try {
      logger.info("Received Payuni return request");
      const { EncryptInfo, HashInfo, Status } = req.body;

      // 驗證 Hash
      if (!verifyWebhookHash(EncryptInfo, HashInfo)) {
        logger.warn("Return URL hash verification failed");
        return res.redirect("/result.html?status=fail&reason=invalid_hash");
      }

      // 解密資料
      const decryptedData = decryptWebhookData(EncryptInfo);

      const resultData = {
        status: Status === "SUCCESS" ? "success" : "fail",
        tradeNo: decryptedData.MerTradeNo,
        tradeSeq: decryptedData.TradeNo,
        tradeAmt: decryptedData.TradeAmt,
        payTime: decryptedData.PayTime || new Date().toISOString(),
        message: decryptedData.Message,
      };

      // 生成一次性權杖
      const token = crypto.randomBytes(32).toString("hex");
      oneTimeTokens.set(token, resultData);
      setTimeout(() => oneTimeTokens.delete(token), ONE_TIME_TOKEN_EXPIRY);

      logger.info("Return data processed, redirecting to result page with token", { tradeNo: resultData.tradeNo });
      res.redirect(`/result.html?token=${token}`);
    } catch (error) {
      logger.error("Return URL processing error", { message: error.message });
      res.redirect("/result.html?status=fail&reason=processing_error");
    }
  });

  return router;
}
