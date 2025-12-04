// ========================================
// 應用常數配置
// ========================================

import dotenv from "dotenv";

// 確保環境變數被載入
dotenv.config();

/**
 * 伺服器配置
 * 監聽埠號、執行環境、網域名稱
 */
export const SERVER_CONFIG = {
  PORT: 80,
  NODE_ENV: process.env.NODE_ENV || "development",
  DOMAIN: process.env.DOMAIN || "https://exam2ple.com",
};

/**
 * PAYUNi 金流配置
 * 支付閘道的 API 端點、商家認證、簽章密鑰
 */
export const PAYUNI_CONFIG = {
  API_URL: process.env.PAYUNI_API_URL,
  MERCHANT_ID: process.env.PAYUNI_MERCHANT_ID,
  HASH_KEY: process.env.PAYUNI_HASH_KEY,
  HASH_IV: process.env.PAYUNI_HASH_IV,
  RETURN_URL: process.env.PAYUNI_RETURN_URL || "https://exam2ple.com",
};

/**
 * 防機器人驗證配置
 * Cloudflare Turnstile CAPTCHA 設定
 */
export const TURNSTILE_CONFIG = {
  ENABLE: process.env.TURNSTILE_ENABLE === "true",
  SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
  VERIFY_URL: "https://challenges.cloudflare.com/turnstile/v0/siteverify",
};

/**
 * Google OAuth 認證配置
 * Google OAuth 2.0 設定
 */
export const GOOGLE_CONFIG = {
  CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
};

/**
 * Google Sheets API 配置
 * Google 試算表資料庫設定
 */
export const GOOGLE_SHEETS_CONFIG = {
  SHEETS_ID: process.env.GOOGLE_SHEETS_ID,
  KEY_FILE: process.env.GOOGLE_SHEETS_KEY_FILE || "./google-key.json",
};

/**
 * 外部服務配置
 */
export const EXTERNAL_SERVICES = {
  NOTIFY_URL: process.env.NOTIFY_URL,
};

/**
 * 工作階段配置
 * Session 與 Cookie 的設定
 */
export const SESSION_CONFIG = {
  SECRET: process.env.SESSION_SECRET,
  COOKIE_MAX_AGE: 1000 * 60 * 60 * 24, // 24 小時
  COOKIE_NAME: "sessionId",
};

/**
 * 流量限制配置
 * Rate Limiting 的限制規則，防止濫用
 */
export const RATE_LIMIT_CONFIG = {
  GENERAL: {
    windowMs: 15 * 60 * 1000, // 15 分鐘
    max: 200, // 每個 IP 最多 200 個請求
    message: { error: "請求過於頻繁，請稍後再試" },
  },
  PAYMENT: {
    windowMs: 60 * 1000, // 1 分鐘
    max: 5, // 每個 IP 最多 5 次支付請求
    message: { error: "支付請求過於頻繁，請稍後再試" },
  },
  API_RESULT: {
    windowMs: 1 * 60 * 1000, // 1 分鐘
    max: 10, // 每個 IP 最多 10 次請求
    message: { error: "查詢請求過於頻繁，請稍後再試" },
  },
};

/**
 * CORS 白名單
 */
export const CORS_ALLOWED_ORIGINS = [
  process.env.PAYUNI_RETURN_URL || "https://exam2ple.com",
  process.env.DOMAIN || "https://exam2ple.com",
  "https://sandbox-api.payuni.com.tw",
  "https://api.payuni.com.tw",
  "http://localhost",
  "http://127.0.0.1",
];

/**
 * CSRF 排除路徑
 */
export const CSRF_EXCLUDED_PATHS = ["/payment-return", "/payuni-webhook"];

/**
 * 必要的環境變數
 */
export const REQUIRED_ENV_VARS = [
  "PAYUNI_API_URL",
  "PAYUNI_MERCHANT_ID",
  "PAYUNI_HASH_KEY",
  "PAYUNI_HASH_IV",
  "TURNSTILE_SECRET_KEY",
  "NOTIFY_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "GOOGLE_SHEETS_ID",
  "SESSION_SECRET",
];

/**
 * 一次性權杖過期時間
 * 單位：毫秒（目前設定為 5 分鐘）
 */
export const ONE_TIME_TOKEN_EXPIRY = 300000; // 5 分鐘
