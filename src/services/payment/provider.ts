/**
 * PayUNi SDK 提供者
 * 管理 PayUNi SDK 單例實例
 */

import { PayuniSDK } from "./PayuniSDK";
import { EXTERNAL_SERVICES, PAYUNI_CONFIG } from "../../config/constants";
import logger from "../../utils/logger";

let sdkInstance: PayuniSDK | null = null;

/**
 * 初始化 PayUNi SDK 實例
 * @returns {PayuniSDK} SDK 實例
 */
export function initPayuniSDK(): PayuniSDK {
  try {
    if (!sdkInstance) {
      const config = {
        merchantId: PAYUNI_CONFIG.MERCHANT_ID!,
        hashKey: PAYUNI_CONFIG.HASH_KEY!,
        hashIV: PAYUNI_CONFIG.HASH_IV!,
        apiUrl: PAYUNI_CONFIG.API_URL!,
        notifyUrl: EXTERNAL_SERVICES.NOTIFY_URL!,
      };

      sdkInstance = new PayuniSDK(config);
      logger.info("PayuniSDK 實例已初始化");
    }
    return sdkInstance;
  } catch (error: any) {
    logger.error("初始化 PayuniSDK 失敗", { error: error.message });
    throw error;
  }
}

/**
 * 取得 PayUNi SDK 實例（延遲初始化）
 * @returns {PayuniSDK} SDK 實例
 */
export function getPayuniSDK(): PayuniSDK {
  if (!sdkInstance) {
    return initPayuniSDK();
  }
  return sdkInstance;
}

/**
 * 重置 SDK 實例（用於測試）
 */
export function resetPayuniSDK(): void {
  sdkInstance = null;
}

export default {
  initPayuniSDK,
  getPayuniSDK,
  resetPayuniSDK,
};
