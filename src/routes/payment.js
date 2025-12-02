import crypto from "crypto";
import { Router } from "express";
import { ONE_TIME_TOKEN_EXPIRY, PAYUNI_CONFIG } from "../config/constants.js";
import { getDatabase } from "../services/database/provider.js";
import {
  createOrder,
  findExistingOrder,
  generatePaymentData,
  generatePeriodPaymentData,
  updateOrder,
} from "../services/index.js";
import { getPayuniSDK } from "../services/payment/provider.js";
import { WebhookHandler } from "../services/webhookHandler.js";
import { PaymentErrors } from "../utils/errors.js";
import logger from "../utils/logger.js";
import {
  buildOrderData,
  generateTradeNo,
  validatePaymentRequest,
} from "../utils/paymentHelpers.js";
import { verifyTurnstile } from "../utils/turnstile.js";
import { createPaymentValidation } from "../utils/validators.js";

/**
 * 建立支付路由
 */
export function createPaymentRoutes(paymentLimiter, oneTimeTokens, products) {
  const router = Router();

  /**
   * 建立支付訂單（一次性）
   */
  router.post("/create-payment", paymentLimiter, createPaymentValidation, async (req, res, next) => {
    try {
      // 1. 驗證請求
      const { product, userEmail, turnstileToken } = validatePaymentRequest(req, products);

      // 2. 驗證 Turnstile
      const isValid = await verifyTurnstile(turnstileToken);
      if (!isValid) {
        throw PaymentErrors.TurnstileVerificationFailed();
      }

      // 3. 查詢現有未完成訂單
      const existingOrder = await findExistingOrder(userEmail, product.id);
      if (existingOrder) {
        const paymentData = generatePaymentData(existingOrder.tradeNo, product, userEmail, PAYUNI_CONFIG.RETURN_URL);
        return res.json(paymentData);
      }

      // 4. 生成新訂單
      const tradeNo = generateTradeNo();
      const orderData = buildOrderData(tradeNo, product, userEmail, PAYUNI_CONFIG.MERCHANT_ID, req.session.user);

      const success = await createOrder(orderData);
      if (!success) {
        throw PaymentErrors.ServerError("訂單建立失敗", { tradeNo });
      }

      // 5. 生成支付資料
      const paymentData = generatePaymentData(tradeNo, product, userEmail, PAYUNI_CONFIG.RETURN_URL);
      logger.info("支付訂單建立成功", { tradeNo, price: product.price });
      
      return res.json(paymentData);
    } catch (error) {
      next(error);
    }
  });

  /**
   * 建立訂閱支付訂單（續期收款）
   */
  router.post("/create-subscription", paymentLimiter, createPaymentValidation, async (req, res, next) => {
    try {
      // 1. 驗證請求
      const { product, userEmail, turnstileToken } = validatePaymentRequest(req, products);

      // 2. 驗證是否為訂閱商品
      if (product.type !== "subscription" || !product.periodConfig) {
        throw PaymentErrors.BadRequest("該商品不是訂閱方案", { productId: product.id });
      }

      // 3. 驗證 Turnstile
      const isValid = await verifyTurnstile(turnstileToken);
      if (!isValid) {
        throw PaymentErrors.TurnstileVerificationFailed();
      }

      // 4. 查詢現有未完成訂單
      const existingOrder = await findExistingOrder(userEmail, product.id);
      if (existingOrder) {
        const tradeNo = existingOrder.tradeNo?.split("_")[0];
        const paymentData = generatePaymentData(tradeNo, product, userEmail, PAYUNI_CONFIG.RETURN_URL);
        return res.json(paymentData);
      }

      // 5. 生成新訂單
      const tradeNo = generateTradeNo();
      const orderData = buildOrderData(
        `${tradeNo}_0`,
        product,
        userEmail,
        PAYUNI_CONFIG.MERCHANT_ID,
        req.session.user,
        "subscription"
      );

      const success = await createOrder(orderData);
      if (!success) {
        throw PaymentErrors.ServerError("訂單建立失敗", { tradeNo });
      }

      // 5. 生成訂閱支付資料
      const periodPaymentData = generatePeriodPaymentData(tradeNo, product, userEmail, PAYUNI_CONFIG.RETURN_URL);
      
      logger.info("訂閱支付建立成功", {
        tradeNo,
        price: product.price,
        periodType: product.periodConfig?.periodType,
        periodTimes: product.periodConfig?.periodTimes,
      });

      return res.json(periodPaymentData);
    } catch (error) {
      next(error);
    }
  });

  /**
   * Payuni Webhook 通知
   */
  router.post("/payuni-webhook", async (req, res) => {
    try {
      logger.info("接收 Payuni webhook 通知");

      // 初始化 webhook 處理器
      const sdk = getPayuniSDK();
      const db = getDatabase();
      const webhookHandler = new WebhookHandler(sdk, db, products);

      // 處理 webhook
      const result = await webhookHandler.processWebhook(req.body);

      if (result.success) {
        res.send("OK");
      } else {
        res.send("FAIL");
      }
    } catch (error) {
      logger.error("Webhook 處理異常", { errorMessage: error.message });
      res.send("FAIL");
    }
  });

  /**
   * PAYUNi ReturnURL
   */
  router.post("/payment-return", async (req, res) => {
    try {
      logger.info("接收 Payuni 返回請求");
      const { EncryptInfo, HashInfo, Status } = req.body;

      // 驗證 Hash
      const sdk = getPayuniSDK();
      if (!sdk.verifyWebhookData(EncryptInfo, HashInfo)) {
        logger.warn("返回 URL 雜湊驗證失敗");
        return res.redirect("/result.html?status=fail&reason=invalid_hash");
      }

      // 解密資料
      const decryptedData = sdk.parseWebhookData(EncryptInfo);

      const resultData = {
        status: decryptedData.Status === "SUCCESS" ? "success" : "fail",
        tradeNo: decryptedData.MerTradeNo,
        tradeSeq: decryptedData.TradeNo,
        tradeAmt: decryptedData.TradeAmt || decryptedData.PeriodAmt,
        payTime: decryptedData.PayTime || new Date().toISOString(),
        message: decryptedData.Message,
      };

      // 生成一次性權杖
      const token = crypto.randomBytes(32).toString("hex");
      oneTimeTokens.set(token, resultData);
      setTimeout(() => oneTimeTokens.delete(token), ONE_TIME_TOKEN_EXPIRY);

      logger.info("返回資料已處理，重導向至結果頁面", {
        tradeNo: resultData.tradeNo,
      });
      res.redirect(`/result.html?token=${token}`);
    } catch (error) {
      logger.error("返回 URL 處理異常", { errorMessage: error.message });
      res.redirect("/result.html?status=fail&reason=processing_error");
    }
  });

  return router;
}
