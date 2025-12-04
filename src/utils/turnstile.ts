import axios from "axios";
import { TURNSTILE_CONFIG } from "../config/constants";
import logger from "./logger";

/**
 * 驗證 Cloudflare Turnstile 驗證碼
 * @param {string} token - Turnstile response token
 * @returns {Promise<boolean>} 驗證結果
 */
export async function verifyTurnstile(token: string): Promise<boolean> {
  if (!TURNSTILE_CONFIG.ENABLE) {
    logger.info("Turnstile is disabled, skipping verification");
    return true;
  }

  if (!token) {
    logger.warn("Turnstile token is missing");
    return false;
  }

  try {
    const response = await axios.post(
      TURNSTILE_CONFIG.VERIFY_URL,
      {
        secret: TURNSTILE_CONFIG.SECRET_KEY,
        response: token,
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 5000,
      }
    );

    if (!response.data.success) {
      logger.warn("Turnstile verification failed", {
        errorCodes: response.data["error-codes"],
      });
      return false;
    }

    logger.info("Turnstile verification successful");
    return true;
  } catch (error: any) {
    logger.error("Turnstile verification error", {
      message: error.message,
      stack: error.stack,
    });
    throw error;
  }
}
