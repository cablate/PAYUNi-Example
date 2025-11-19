import logger from "../utils/logger.js";
import { getPayuniSDK } from "./payment/provider.js";

/**
 * 生成續期收款支付資料
 */
export function generatePeriodPaymentData(tradeNo, product, userEmail, returnUrl) {
  const sdk = getPayuniSDK();
  const periodPaymentInfo = sdk.generatePeriodPaymentInfo(
    tradeNo,
    product,
    userEmail,
    returnUrl
  );

  logger.info("Period payment data generated", {
    tradeNo,
    productId: product.id,
    periodType: product.periodConfig?.periodType,
    periodTimes: product.periodConfig?.periodTimes,
  });

  return {
    payUrl: periodPaymentInfo.payUrl,
    data: periodPaymentInfo.data,
  };
}

/**
 * 驗證並解析續期Webhook資料
 */
export function validateAndParsePeriodWebhook(encryptInfo, hashInfo) {
  const sdk = getPayuniSDK();
  return sdk.validateAndParseWebhook(encryptInfo, hashInfo);
}

