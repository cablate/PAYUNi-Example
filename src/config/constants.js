// ========================================
// 應用常數配置
// ========================================

/**
 * 伺服器配置
 */
export const SERVER_CONFIG = {
  PORT: 80,
  NODE_ENV: process.env.NODE_ENV || "development",
  DOMAIN: process.env.DOMAIN || "https://exam2ple.com",
};

/**
 * PAYUNi 配置
 */
export const PAYUNI_CONFIG = {
  API_URL: process.env.PAYUNI_API_URL,
  MERCHANT_ID: process.env.PAYUNI_MERCHANT_ID,
  HASH_KEY: process.env.PAYUNI_HASH_KEY,
  HASH_IV: process.env.PAYUNI_HASH_IV,
  RETURN_URL: process.env.PAYUNI_RETURN_URL || "https://exam2ple.com",
};

/**
 * Turnstile 驗證配置
 */
export const TURNSTILE_CONFIG = {
  ENABLE: process.env.TURNSTILE_ENABLE === "true",
  SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
  VERIFY_URL: "https://challenges.cloudflare.com/turnstile/v0/siteverify",
};

/**
 * Google OAuth 配置
 */
export const GOOGLE_CONFIG = {
  CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
};

/**
 * 外部服務配置
 */
export const EXTERNAL_SERVICES = {
  GAS_WEBHOOK_URL: process.env.GAS_WEBHOOK_URL,
  WEBHOOK_TOKEN: process.env.WEBHOOK_TOKEN,
  NOTIFY_URL: process.env.NOTIFY_URL,
};

/**
 * Session 配置
 */
export const SESSION_CONFIG = {
  SECRET: process.env.SESSION_SECRET,
  COOKIE_MAX_AGE: 1000 * 60 * 60 * 24, // 24 小時
  COOKIE_NAME: "sessionId",
};

/**
 * Rate Limiting 配置
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
  "GAS_WEBHOOK_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "SESSION_SECRET",
];

/**
 * 一次性權杖過期時間（毫秒）
 */
export const ONE_TIME_TOKEN_EXPIRY = 300000; // 5 minutes
