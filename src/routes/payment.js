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
      logger.info("Payment created successfully", { tradeNo, amount: product.price });
      
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
      
      logger.info("Subscription payment created successfully", {
        tradeNo,
        amount: product.price,
        periodType: product.periodConfig?.periodType,
        periodTimes: product.periodConfig?.periodTimes,
      });

      return res.json(periodPaymentData);
    } catch (error) {
      next(error);
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

      // 驗證 Hash (直接使用 SDK)
      const sdk = getPayuniSDK();
      if (!sdk.verifyWebhookData(EncryptInfo, HashInfo)) {
        logger.warn("Webhook Hash verification failed");
        return res.send("FAIL");
      }

      // 解密資料 (直接使用 SDK)
      const parsedData = sdk.parseWebhookData(EncryptInfo);
      const tradeNo = parsedData.MerTradeNo;
      const tradeSeq = parsedData.TradeNo;
      const payStatus = parsedData.Status || "已完成";
      const isPeriod = parsedData.PeriodAmt > 0 || parsedData.PeriodTradeNo;

      if (!tradeNo) {
        logger.warn("Missing MerTradeNo in webhook data");
        return res.send("FAIL");
      }

      logger.info("Webhook verified", { tradeNo, tradeSeq, payStatus });

      // 二次確認：向 Payuni API 查詢訂單狀態
      let queryResult = null;
      try {
        queryResult = await sdk.queryTradeStatus(tradeNo);

        if (!queryResult.success) {
          logger.error("❌ 查詢訂單失敗，放棄更新", {
            tradeNo,
            error: queryResult.error,
          });
          return res.send("FAIL");
        }

        // 驗證查詢結果與 Webhook 資料的金額是否一致
        const queryData = queryResult.data;
        const webhookAmount = parseInt(parsedData.TradeAmt || parsedData.PeriodAmt);
        const queryAmount = parseInt(queryData.amount);

        if (queryAmount !== webhookAmount) {
          logger.error("❌ webhook 回調金額不符，請注意", {
            tradeNo,
            webhookAmount,
            queryAmount,
          });
          return res.send("FAIL");
        }

        logger.info("✓ API 查詢成功", {
          tradeNo,
          amount: queryAmount,
          status: queryData.tradeStatusText,
          isPaid: queryData.isPaid,
        });
      } catch (queryError) {
        logger.error("⚠️ 查詢訂單異常，放棄更新", {
          tradeNo,
          error: queryError.message,
        });
        return res.send("FAIL");
      }

      // 使用查詢 API 的資料作為主要信息來源
      const queryData = queryResult.data;
      const updateData = {
        MerTradeNo: isPeriod ? `${tradeNo.split("_")[0]}_0` : tradeNo,
        TradeSeq: queryData.tradeNo,
        Status: queryData.tradeStatusText,
        PeriodTradeNo: parsedData.PeriodTradeNo || "",
        PaymentMethod: queryData.paymentMethod || queryData.cardBankName || "信用卡",
        rawData: {
          ...parsedData,
          ...queryData,
        },
      };

      const updateSuccess = await updateOrder(updateData);
      if (!updateSuccess) {
        logger.error("❌ 更新訂單失敗", { tradeNo });
        return res.send("FAIL");
      }

      logger.info("✓ Webhook 處理成功（以 API 查詢資料為準）", {
        tradeNo,
        status: queryData.tradeStatusText,
        amount: queryData.amount,
        isPaid: queryData.isPaid,
        verified: true,
      });

      // 授予權益
      try {
        const db = getDatabase();
        // 訂閱制需要轉換訂單號：_1、_2... -> _0 (原始訂單)
        const searchTradeNo = isPeriod ? `${tradeNo.split("_")[0]}_0` : tradeNo;
        const order = await db.getOrderByTradeNo(searchTradeNo);
        
        if (order) {
          const product = products.find((p) => p.id === order.productID);
          const user = await db.findUserByEmail(order.email);

          if (product && user) {
            await db.grantEntitlement(user.googleId, product, searchTradeNo);
            logger.info("✓ 權益已授予", { userId: user.googleId, productId: product.id });
          } else {
            logger.warn("無法授予權益：找不到商品或使用者", { 
              productId: order.productID, 
              email: order.email 
            });
          }
        } else {
          logger.warn("無法授予權益：找不到訂單", { 
            originalTradeNo: tradeNo,
            searchTradeNo: searchTradeNo
          });
        }

        // 記錄訂閱扣款（如果是訂閱制）
        if (isPeriod) {
          const periodTradeNo = parsedData.PeriodTradeNo || "";
          const sequenceMatch = tradeNo.match(/_(\d+)$/);
          const sequenceNo = sequenceMatch ? parseInt(sequenceMatch[1]) : 0;

          await db.recordPeriodPayment({
            periodTradeNo: periodTradeNo,
            baseOrderNo: searchTradeNo,
            sequenceNo: sequenceNo,
            tradeSeq: queryData.tradeNo,
            amount: queryData.amount,
            status: queryData.tradeStatusText,
            paymentTime: queryData.paymentDay || new Date().toISOString(),
            remark: JSON.stringify({ isPaid: queryData.isPaid, message: queryData.message }),
          });
          logger.info("✓ 訂閱扣款已記錄", { periodTradeNo, sequenceNo });
        }
      } catch (entitlementError) {
        logger.error("授予權益時發生錯誤", { error: entitlementError.message });
        // 不阻擋 Webhook 回應，因為訂單已更新成功
      }

      res.send("OK");
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
      const sdk = getPayuniSDK();
      if (!sdk.verifyWebhookData(EncryptInfo, HashInfo)) {
        logger.warn("Return URL hash verification failed");
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

      logger.info("Return data processed, redirecting to result page with token", {
        tradeNo: resultData.tradeNo,
      });
      res.redirect(`/result.html?token=${token}`);
    } catch (error) {
      logger.error("Return URL processing error", { message: error.message });
      res.redirect("/result.html?status=fail&reason=processing_error");
    }
  });

  return router;
}
