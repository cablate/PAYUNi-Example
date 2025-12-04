import crypto from "crypto";
import { Router } from "express";
import { ONE_TIME_TOKEN_EXPIRY, PAYUNI_CONFIG } from "../config/constants.js";
import { getDatabase } from "../services/database/provider.js";
import {
  createOrder,
  findExistingOrder,
} from "../services/business/order-service.js";
import { getPayuniSDK } from "../services/payment/provider.js";
import { createPayuniGateway } from "../services/payment/payuni-gateway.js";
import { createWebhookHandler } from "../services/orchestration/webhook-handler.js";
import { createWebhookProcessor } from "../services/business/webhook-processor.js";
import { PaymentErrors } from "../utils/errors.js";
import logger from "../utils/logger.js";
import {
  buildOrderData,
  generateTradeNo,
  validatePaymentRequest,
} from "../utils/payment-helpers.js";
import { verifyTurnstile } from "../utils/turnstile.js";
import { createPaymentValidation } from "../utils/validators.js";

/**
 * 建立支付路由
 *
 * 包含以下端點：
 * - POST /create-payment - 建立一次性支付訂單
 * - POST /create-subscription - 建立訂閱支付訂單
 * - POST /payuni-webhook - Payuni Webhook 通知處理
 * - POST /payment-return - Payuni 返回 URL 處理
 *
 * @param {Object} paymentLimiter - 支付速率限制中間件
 * @param {Map} oneTimeTokens - 一次性權杖快取 (用於保存支付結果)
 * @param {Array<Object>} products - 商品清單
 * @returns {Router} Express 路由物件
 *
 * @example
 * const paymentRoutes = createPaymentRoutes(limiter, tokenMap, products);
 * app.use('/api', paymentRoutes);
 */
export function createPaymentRoutes(paymentLimiter, oneTimeTokens, products) {
  const router = Router();

  /**
   * POST /create-payment
   * 建立一次性支付訂單
   *
   * 此端點用於建立一次性購買的支付訂單。流程：
   * 1. 驗證請求資料（商品 ID、用戶信箱）
   * 2. 驗證 Turnstile 安全認證
   * 3. 查詢現有未完成訂單（重複請求時）
   * 4. 建立新訂單記錄
   * 5. 生成支付資料並返回支付表單
   *
   * @async
   * @param {Object} req - Express 請求物件
   * @param {Object} req.body - 請求主體
   * @param {string} req.body.productID - 商品 ID
   * @param {string} req.body.turnstileToken - Turnstile 驗證 Token
   * @param {Object} req.session.user - 當前登入用戶（來自 Google OAuth）
   * @param {Object} res - Express 回應物件
   * @param {Function} next - 下一個中間件或錯誤處理
   *
   * @returns {Promise<void>} 返回支付資料 JSON
   * @throws {PaymentError} 各種支付相關錯誤（驗證失敗、訂單建立失敗等）
   *
   * @example
   * // 請求範例
   * POST /create-payment
   * {
   *   "productID": "product_123",
   *   "turnstileToken": "0.abc123..."
   * }
   *
   * // 回應範例
   * {
   *   "success": true,
   *   "payUrl": "https://payment.payuni.com.tw/",
   *   "data": {
   *     "MerchantID": "merchant_123",
   *     "TradeNo": "PAY20251201000001",
   *     "...": "..."
   *   }
   * }
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
        // 使用 Gateway 生成支付資料
        const sdk = getPayuniSDK();
        const gateway = createPayuniGateway(sdk);
        const paymentData = gateway.createPayment(
          { tradeNo: existingOrder.tradeNo, product, userEmail },
          PAYUNI_CONFIG.RETURN_URL
        );
        return res.json(paymentData);
      }

      // 4. 生成新訂單
      const tradeNo = generateTradeNo();
      const orderData = buildOrderData(tradeNo, product, userEmail, PAYUNI_CONFIG.MERCHANT_ID, req.session.user);

      const success = await createOrder(orderData);
      if (!success) {
        throw PaymentErrors.ServerError("訂單建立失敗", { tradeNo });
      }

      // 5. 使用 Gateway 生成支付資料
      const sdk = getPayuniSDK();
      const gateway = createPayuniGateway(sdk);
      const paymentData = gateway.createPayment(
        { tradeNo, product, userEmail },
        PAYUNI_CONFIG.RETURN_URL
      );
      logger.info("支付訂單建立成功", { tradeNo, price: product.price });

      return res.json(paymentData);
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /create-subscription
   * 建立訂閱支付訂單
   *
   * 此端點用於建立訂閱制商品的支付訂單。支援定期收費。流程：
   * 1. 驗證請求資料（商品 ID、用戶信箱）
   * 2. 驗證商品是否為訂閱方案
   * 3. 驗證 Turnstile 安全認證
   * 4. 查詢現有未完成訂單（重複請求時）
   * 5. 建立新訂單記錄
   * 6. 生成訂閱支付資料並返回支付表單
   *
   * @async
   * @param {Object} req - Express 請求物件
   * @param {Object} req.body - 請求主體
   * @param {string} req.body.productID - 商品 ID（必須是訂閱方案）
   * @param {string} req.body.turnstileToken - Turnstile 驗證 Token
   * @param {Object} req.session.user - 當前登入用戶（來自 Google OAuth）
   * @param {Object} res - Express 回應物件
   * @param {Function} next - 下一個中間件或錯誤處理
   *
   * @returns {Promise<void>} 返回訂閱支付資料 JSON
   * @throws {PaymentError} 商品不存在、不是訂閱方案、驗證失敗等錯誤
   *
   * @example
   * // 請求範例
   * POST /create-subscription
   * {
   *   "productID": "subscription_pro",
   *   "turnstileToken": "0.abc123..."
   * }
   *
   * // 回應範例
   * {
   *   "success": true,
   *   "payUrl": "https://payment.payuni.com.tw/",
   *   "data": {
   *     "MerchantID": "merchant_123",
   *     "TradeNo": "PAY20251201000002",
   *     "PeriodAmount": 299,
   *     "PeriodType": "M",
   *     "PeriodRetryTimes": 12,
   *     "...": "..."
   *   }
   * }
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
        // 使用 Gateway 生成訂閱支付資料
        const sdk = getPayuniSDK();
        const gateway = createPayuniGateway(sdk);
        const paymentData = gateway.createSubscription(
          { tradeNo, product, userEmail },
          PAYUNI_CONFIG.RETURN_URL
        );
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

      // 6. 使用 Gateway 生成訂閱支付資料
      const sdk = getPayuniSDK();
      const gateway = createPayuniGateway(sdk);
      const periodPaymentData = gateway.createSubscription(
        { tradeNo, product, userEmail },
        PAYUNI_CONFIG.RETURN_URL
      );

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
   * POST /payuni-webhook
   * Payuni Webhook 通知處理
   *
   * 此端點由 Payuni 金流服務調用，用於通知支付結果。支援：
   * - 一次性支付結果通知
   * - 訂閱定期收費結果通知
   * - 訂閱取消通知
   * - 訂閱暫停/恢復通知
   *
   * 端點會驗證 Webhook 簽章，更新訂單狀態，並授予對應權益。
   *
   * @async
   * @param {Object} req - Express 請求物件
   * @param {Object} req.body - Webhook 通知資料（Payuni 加密的 EncryptInfo）
   * @param {Object} res - Express 回應物件
   * @returns {Promise<void>} 返回 OK 或 FAIL
   *
   * @remarks
   * - Webhook 通知時機：支付完成、訂閱定期扣款成功
   * - 簽章驗證：使用 Payuni SDK 的 verifyWebhookData 方法
   * - 資料解密：使用 SDK 的 parseWebhookData 方法
   * - 通知結果：成功返回 OK，失敗返回 FAIL
   * - 不應拋出異常，而應返回 FAIL，以避免 Payuni 重試
   *
   * @example
   * // Payuni 會發送 POST 請求
   * POST /api/payuni-webhook
   * {
   *   "EncryptInfo": "...",
   *   "HashInfo": "..."
   * }
   *
   * // 響應
   * OK  // 或 FAIL
   */
  router.post("/payuni-webhook", async (req, res) => {
    try {
      logger.info("接收 Payuni webhook 通知");

      // 初始化依賴
      const sdk = getPayuniSDK();
      const gateway = createPayuniGateway(sdk);
      const db = getDatabase();
      const processor = createWebhookProcessor(db, products);
      const handler = createWebhookHandler(gateway, processor);

      // 處理 webhook
      const result = await handler.processWebhook(req.body);

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
   * POST /payment-return
   * Payuni 支付返回 URL 處理
   *
   * 此端點為 Payuni 的支付返回 URL，用戶在 Payuni 完成支付後會被重導至此。
   * 負責：
   * 1. 驗證返回資料的完整性（Hash 驗證）
   * 2. 解密支付結果資料
   * 3. 生成一次性權杖（用於前端查詢結果）
   * 4. 重導至結果頁面
   *
   * @async
   * @param {Object} req - Express 請求物件
   * @param {Object} req.body - Payuni 返回資料
   * @param {string} req.body.EncryptInfo - 加密的支付結果資料
   * @param {string} req.body.HashInfo - 雜湊簽章（用於驗證）
   * @param {string} req.body.Status - 交易狀態（SUCCESS 或其他）
   * @param {Object} res - Express 回應物件
   * @returns {Promise<void>} HTTP 重導至 result.html
   *
   * @remarks
   * - 返回資料並不代表最終支付狀態，應主要依賴 Webhook 通知
   * - Hash 驗證失敗時返回 invalid_hash
   * - 處理過程中的任何異常都返回 processing_error
   * - 一次性權杖有效期為 ONE_TIME_TOKEN_EXPIRY（通常 5-10 分鐘）
   * - 前端可通過查詢字串中的 token 參數獲取支付結果
   *
   * @example
   * // Payuni 會進行 POST 重導
   * POST /payment-return
   * {
   *   "EncryptInfo": "...",
   *   "HashInfo": "...",
   *   "Status": "SUCCESS"
   * }
   *
   * // 響應為 HTTP 重導
   * 302 Found
   * Location: /result.html?token=abc123def456...
   */
  router.post("/payment-return", async (req, res) => {
    try {
      logger.info("接收 Payuni 返回請求");
      const { EncryptInfo, HashInfo, Status } = req.body;

      // 驗證和解析（使用 Gateway）
      const sdk = getPayuniSDK();
      const gateway = createPayuniGateway(sdk);

      if (!gateway.verifyWebhook(req.body)) {
        logger.warn("返回 URL 雜湊驗證失敗");
        return res.redirect("/result.html?status=fail&reason=invalid_hash");
      }

      // 解密資料
      const decryptedData = gateway.parseWebhook(req.body);

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
