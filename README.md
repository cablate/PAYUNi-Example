# 統一金流 (Payuni) 測試專案

這是一個用於測試統一金流 API 整合的簡單專案，包含後端伺服器和前端支付介面。

## 功能特色

- Cloudflare Turnstile CAPTCHA 驗證
- 建立信用卡支付訂單
- AES-256-GCM 加密交易資料
- SHA256 雜湊驗證
- 支付結果通知接收

## 環境需求

- Node.js 14 或以上版本
- Payuni 商店帳號（測試環境）
- Cloudflare Turnstile（用於 CAPTCHA 驗證）

## 安裝步驟

1. 安裝相依套件：

```bash
npm install
```

2. 建立 `.env` 檔案並設定以下環境變數：

```env
PAYUNI_API_URL=https://sandbox-api.payuni.com.tw/api/trade
PAYUNI_MERCHANT_ID=your_merchant_id
PAYUNI_HASH_KEY=your_hash_key
PAYUNI_HASH_IV=your_hash_iv
TURNSTILE_SECRET_KEY=your_turnstile_secret_key
TURNSTILE_ENABLE=true
```

**環境變數說明**：

- `TURNSTILE_ENABLE`: 是否啟用 Turnstile 驗證（true/false，預設：false）
- `TURNSTILE_SECRET_KEY`: Cloudflare Turnstile Secret Key（啟用驗證時必需）

3. 在 `index.html` 中設定 Turnstile Site Key：

```html
<div class="cf-turnstile" data-sitekey="YOUR_SITE_KEY"></div>
```

將 `YOUR_SITE_KEY` 替換為你的 Cloudflare Turnstile Site Key。

## 啟動方式

```bash
npm start
```

伺服器將在 `http://localhost` 啟動。

## 使用說明

1. 開啟瀏覽器訪問 `http://localhost`
2. 如果啟用了 Turnstile 驗證（`TURNSTILE_ENABLE=true`），需先完成 CAPTCHA 驗證
3. 點擊「Pay with Credit Card」按鈕
4. 系統會自動導向統一金流付款頁面
5. 完成付款

## API 端點

- `POST /create-payment` - 建立支付訂單（需驗證 Turnstile token）
- `POST /` - 支付結果通知接收
- `GET /` - 靜態 HTML 頁面

## 技術堆疊

- Express.js - 後端框架
- Axios - HTTP 請求
- Crypto - 加密處理
- CORS - 跨域請求支援
- Winston - 日誌系統
- Chalk - 終端顏色輸出
- Figlet - ASCII 藝術文字
- Cloudflare Turnstile - CAPTCHA 驗證

## 注意事項

- 此為測試環境專案，請勿用於正式環境
- 請妥善保管 `.env` 檔案中的金鑰資訊
- 交易金額固定為 100 元（測試用途）
- 日誌會保存在 `logs/` 目錄
- 支援環境變數 `LOG_LEVEL` 控制日誌級別（debug、info、warn、error）

## 獲取 Turnstile 金鑰

1. 前往 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 找到 Turnstile 服務
3. 建立新的 Site Key 和 Secret Key
4. 將 Site Key 放在 `index.html`，Secret Key 放在 `.env`
