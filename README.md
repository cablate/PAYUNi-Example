# 🔧 金流串接系統 - 完整設定指南

> **版本**：v1.0
> **最後更新**：2025-12-02
> **目標對象**：開發者與 Junior 工程師

---

## 📋 目錄

- [專案概述](#專案概述)
- [快速開始](#快速開始)
- [架構說明](#架構說明)
- [API 文檔](#api-文檔)
- [開發指南](#開發指南)
- [部署指南](#部署指南)
- [故障排除](#故障排除)

---

## 專案概述

### 功能特色
- ✅ **Google OAuth 認證**：支援使用 Google 帳號登入
- ✅ **訂閱制與一次性支付**：完整的支付方案支援
- ✅ **PAYUNi 金流整合**：安全的支付處理與 Webhook 驗證
- ✅ **多層安全防護**：CSRF、Rate Limit、Helmet 安全頭
- ✅ **Google Sheets 資料庫**：無伺服器的資料存儲解決方案
- ✅ **Cloudflare Turnstile**：機器人驗證防護

### 技術棧

| 層級 | 技術 |
|------|------|
| **後端** | Node.js + Express.js (ES6 模組) |
| **認證** | Google OAuth 2.0 + express-session |
| **支付** | PAYUNi SDK |
| **資料庫** | Google Sheets API |
| **安全** | Helmet、express-rate-limit、CSRF Token、Turnstile |
| **日誌** | Winston |
| **前端** | HTML5 + CSS3 + Vanilla JavaScript |

---

## 快速開始

### 前置需求

- Node.js 16 或以上
- npm 或 yarn
- Google Cloud 專案（用於 OAuth 與 Google Sheets API）
- PAYUNi 商家帳號（沙箱或正式環境）
- Cloudflare Turnstile 帳號（可選，但建議啟用）

### 步驟 1：環境設定

#### 1.1 複製環境變數範本

```bash
cp .env.example .env
```

#### 1.2 設定 Google OAuth

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)
2. 建立新的 OAuth 2.0 認證（類型：網路應用程式）
3. 設定重新導向 URI：`https://your-domain.com/auth/google/callback`
4. 複製 Client ID 與 Client Secret 至 `.env`：

```bash
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_REDIRECT_URI=https://your-domain.com/auth/google/callback
```

#### 1.3 設定 PAYUNi

1. 登入 PAYUNi 商家後台
2. 取得 Merchant ID、Hash Key、Hash IV
3. 設定 Webhook 通知 URL：`https://your-domain.com/payuni-webhook`
4. 填寫 `.env`：

```bash
PAYUNI_MERCHANT_ID=your_merchant_id_here
PAYUNI_HASH_KEY=your_32_character_hash_key_here
PAYUNI_HASH_IV=your_16_character_iv_here
PAYUNI_API_URL=https://sandbox-api.payuni.com.tw/api/trade  # 沙箱環境
PAYUNI_RETURN_URL=https://your-domain.com
```

**⚠️ 重要**：生產環境請改為正式 URL：`https://api.payuni.com.tw/api/trade`

#### 1.4 設定 Cloudflare Turnstile（可選）

1. 前往 [Cloudflare 控制台](https://dash.cloudflare.com/)
2. 建立 Turnstile 站點
3. 複製 Secret Key 至 `.env`：

```bash
TURNSTILE_ENABLE=true
TURNSTILE_SECRET_KEY=your_turnstile_secret_key_here
```

#### 1.5 設定伺服器與安全選項

```bash
# 域名設定
DOMAIN=https://your-domain.com

# 伺服器設定
NODE_ENV=development
PORT=80
LOG_LEVEL=info

# Session 與 CSRF 防護
SESSION_SECRET=your_random_secret_key_at_least_32_characters_long
WEBHOOK_TOKEN=your-protect-secret-token
```

### 步驟 2：安裝依賴

```bash
npm install
# 或
yarn install
```

### 步驟 3：初始化 Google Sheets

```bash
# 初始化 Google Sheets 資料庫結構
node init-sheets.js
```

此指令會：
- 驗證 Google Cloud 權限
- 建立必要的 Sheets（訂單、訂閱等）
- 設定資料欄位與公式

### 步驟 4：啟動服務

```bash
# 開發環境
npm start

# 應輸出：
# ⚡ 伺服器已啟動，監聽埠號 80
# 🌍 訪問地址：http://localhost
```

### 驗證安裝

- 開啟 http://localhost（或您的域名）
- 檢查是否能看到登入畫面
- 嘗試使用 Google 帳號登入
- 驗證商品列表是否正常顯示

---

## 架構說明

### 資料夾結構

```
金流串接/
├── README.md                   # ⭐ 本文件
├── .env.example                # 環境變數範本
├── package.json
├── index.js                    # 應用進入點
│
├── src/
│   ├── config/
│   │   └── constants.js        # 全局常數配置
│   ├── data/
│   │   └── products.js         # 商品資料
│   ├── middleware/
│   │   ├── errorHandler.js     # 錯誤處理中間件
│   │   └── security.js         # 安全中間件（CSRF、Rate Limit 等）
│   ├── routes/
│   │   ├── auth.js             # Google OAuth 認證路由
│   │   ├── orders.js           # 訂單查詢路由
│   │   ├── payment.js          # 支付相關路由（含 Webhook）
│   │   └── subscriptions.js    # 訂閱管理路由
│   ├── services/
│   │   ├── database/
│   │   │   ├── provider.js     # Google Sheets 提供者
│   │   │   └── GoogleSheets.js # Google Sheets API 包裝
│   │   └── payment/
│   │       ├── provider.js     # 支付提供者
│   │       └── PayuniSDK.js    # PAYUNi SDK 包裝
│   └── utils/
│       ├── crypto.js           # 加密工具
│       ├── errors.js           # 自定義錯誤類別
│       ├── logger.js           # 日誌工具
│       ├── paymentHelpers.js   # 支付輔助函數
│       ├── startup.js          # 啟動提示與驗證
│       ├── turnstile.js        # Turnstile 驗證工具
│       └── validators.js       # 輸入驗證工具
│
├── _frontend/
│   ├── index.html              # 主頁面
│   ├── orders.html             # 訂單查詢頁面
│   ├── subscriptions.html      # 訂閱管理頁面
│   ├── result.html             # 支付結果頁面
│   └── public/
│       ├── style.css           # 樣式表
│       ├── landing.css         # 登陸頁面樣式
│       ├── app.js              # ⭐ 待模組化（主要應用邏輯）
│       ├── orders.js           # 訂單頁面邏輯
│       ├── subscriptions.js    # 訂閱頁面邏輯
│       ├── result.js           # 結果頁面邏輯
│       └── images/
│           └── ...             # 圖片資源
│
├── tests/                      # ⭐ 後續新增
│   ├── utils/
│   └── services/
│
└── docs/                       # 額外文檔（可選）
```

### 資料流向

```
使用者瀏覽器
    ↓
Google OAuth 登入
    ↓
Express 伺服器 → Google Sheets（資料儲存）
    ↓
PAYUNi 支付網關
    ↓
Webhook 通知 → 更新 Google Sheets
    ↓
支付結果頁面
```

### 核心模組說明

#### 認證模組 (`src/routes/auth.js`)
- 處理 Google OAuth 認證流程
- 管理 Session（使用 express-session）
- 提供使用者資訊 API (`/api/me`)
- 執行登出操作

#### 支付模組 (`src/routes/payment.js`)
- 建立支付訂單 (`/create-payment`)
- 建立訂閱訂單 (`/create-subscription`)
- 處理 Webhook 回調 (`/payuni-webhook`)
- 驗證支付簽章與狀態更新

#### 訂單模組 (`src/routes/orders.js`)
- 查詢使用者訂單 (`/api/orders`)
- 取得訂單詳情
- 管理訂單狀態

#### 訂閱模組 (`src/routes/subscriptions.js`)
- 管理使用者訂閱 (`/api/subscriptions`)
- 取消訂閱
- 查詢訂閱狀態

---

## API 文檔

### 認證 API

#### 1. Google OAuth 重定向

```
GET /auth/google
```

啟動 Google OAuth 認證流程。

**回應**：重定向至 Google 登入頁面

---

#### 2. OAuth 回調

```
GET /auth/google/callback?code=...
```

Google 重定向回的回調端點，自動交換授權碼。

**回應**：重定向至主頁面，設定 Session Cookie

---

#### 3. 取得登入狀態

```
GET /api/me
```

檢查目前登入的使用者。

**成功回應** (200):
```json
{
  "loggedIn": true,
  "user": {
    "id": "google_user_id",
    "name": "使用者名稱",
    "email": "user@example.com",
    "picture": "https://...",
    "entitlements": [
      {
        "type": "subscription|one_time",
        "productId": "...",
        "status": "active|expired|cancelled",
        "expiresAt": "2025-12-31T23:59:59Z"
      }
    ]
  }
}
```

**未登入回應** (200):
```json
{
  "loggedIn": false
}
```

---

#### 4. 登出

```
GET /logout
```

清除 Session，使用者登出。

**回應**：重定向至主頁面

---

### 支付 API

#### 1. 建立一次性支付訂單

```
POST /create-payment
X-CSRF-Token: <token>
Content-Type: application/json

{
  "productID": "product_id",
  "turnstileToken": "turnstile_token"
}
```

**成功回應** (200):
```json
{
  "success": true,
  "data": {
    "payUrl": "https://payuni.com.tw/...",
    "tradeNo": "PAY202512021234567890",
    "data": {
      "MerchantID": "...",
      "TradeInfo": "...",
      "TradeSha": "..."
    }
  }
}
```

**失敗回應** (400/401/500):
```json
{
  "success": false,
  "error": "錯誤訊息"
}
```

---

#### 2. 建立訂閱訂單

```
POST /create-subscription
X-CSRF-Token: <token>
Content-Type: application/json

{
  "productID": "subscription_product_id",
  "turnstileToken": "turnstile_token"
}
```

**回應格式**：同支付訂單，但 `TradeInfo` 包含訂閱參數

---

#### 3. PAYUNi Webhook 通知

```
POST /payuni-webhook
Content-Type: application/x-www-form-urlencoded

MerchantID=...&TradeInfo=...&TradeSha=...
```

伺服器會自動：
1. 驗證簽章
2. 解密 TradeInfo
3. 更新 Google Sheets
4. 授予使用者權益

**回應** (200):
```json
{
  "success": true,
  "message": "Webhook processed successfully"
}
```

---

#### 4. 取得 CSRF Token

```
GET /csrf-token
```

前端初始化時需要的 CSRF Token。

**回應** (200):
```json
{
  "csrfToken": "..."
}
```

---

#### 5. 取得客戶端配置

```
GET /api/client-config
```

前端所需的客戶端配置（如 Turnstile 啟用狀態）。

**回應** (200):
```json
{
  "turnstileEnable": true,
  "domain": "https://your-domain.com"
}
```

---

### 訂單 API

#### 1. 查詢使用者訂單

```
GET /api/orders
```

需要已登入。

**成功回應** (200):
```json
{
  "success": true,
  "orders": [
    {
      "tradeNo": "PAY202512021234567890",
      "productId": "product_1",
      "amount": 2990,
      "status": "paid|pending|failed",
      "createdAt": "2025-12-02T10:00:00Z",
      "paidAt": "2025-12-02T10:05:00Z"
    }
  ]
}
```

---

### 訂閱 API

#### 1. 查詢使用者訂閱

```
GET /api/subscriptions
```

需要已登入。

**成功回應** (200):
```json
{
  "success": true,
  "subscriptions": [
    {
      "subscriptionId": "SUB001",
      "productId": "premium_monthly",
      "status": "active|expired|cancelled",
      "startDate": "2025-11-01T00:00:00Z",
      "renewalDate": "2025-12-01T00:00:00Z"
    }
  ]
}
```

---

## 開發指南

### 新增商品

#### 1. 編輯商品清單

**檔案**：`src/data/products.js`

```javascript
export default [
  {
    id: "basic_monthly",
    name: "基礎方案 - 月付",
    price: 990,
    description: "每月 NT$990",
    type: "subscription",  // 'subscription' 或 'one_time'
    billingCycle: "monthly", // 月週期
    features: ["功能 1", "功能 2"]
  },
  {
    id: "premium_lifetime",
    name: "永久授權",
    price: 9990,
    description: "一次性付款",
    type: "one_time",
    features: ["終身存取", "優先支持"]
  }
];
```

#### 2. 同步至 Google Sheets

重新啟動伺服器，商品將自動同步。

```bash
npm start
```

#### 3. 測試新商品

1. 重新整理前端頁面
2. 商品應出現在列表中
3. 嘗試建立支付訂單

---

### 測試支付流程

#### 完整測試步驟

**環境**：使用 PAYUNi 沙箱環境

1. **登入**
   ```
   瀏覽 http://localhost
   點擊 "使用 Google 帳號登入"
   完成 Google OAuth 認證
   ```

2. **選擇商品**
   ```
   在 "選擇方案" 步驟選擇商品
   點擊商品卡片進行選擇
   ```

3. **驗證與支付**
   ```
   完成 Turnstile 人機驗證（如已啟用）
   點擊 "前往付款" 按鈕
   重定向至 PAYUNi 支付頁面
   ```

4. **沙箱測試卡號**
   ```
   卡號：4111111111111111
   有效期：12/25
   CVV：123
   ```

5. **Webhook 驗證**
   ```
   支付完成後，伺服器應收到 Webhook 通知
   檢查日誌：支付訂單成功更新
   使用者應看到成功頁面
   ```

#### 除錯技巧

- **檢查伺服器日誌**：`npm start` 輸出
- **檢查瀏覽器控制台**：F12 → Console
- **檢查 Google Sheets**：確認訂單資料是否已寫入
- **驗證環境變數**：啟動時會列出所有配置

---

### 訂閱制配置

#### 啟用訂閱功能

1. **在 `products.js` 中定義訂閱商品**

```javascript
{
  id: "premium_monthly",
  name: "Premium 月訂閱",
  price: 2990,
  type: "subscription",
  billingCycle: "monthly"
}
```

2. **訂閱流程自動處理**

伺服器會自動：
- 在 Google Sheets 建立訂閱記錄
- 計算續期日期
- 管理訂閱狀態變更

3. **檢查訂閱狀態**

```bash
# 查詢 API
GET /api/subscriptions

# 回應包含：
# - status: "active" | "expired" | "cancelled"
# - renewalDate: 下次續期日期
```

---

## 部署指南

### 環境變數清單

| 變數 | 說明 | 必填 | 範例 |
|------|------|------|------|
| `DOMAIN` | 網域名稱 | ✅ | `https://example.com` |
| `NODE_ENV` | 執行環境 | ✅ | `production` |
| `PORT` | 監聽埠號 | ✅ | `80` |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID | ✅ | `...` |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Secret | ✅ | `...` |
| `GOOGLE_REDIRECT_URI` | OAuth 回調 URI | ✅ | `https://example.com/auth/google/callback` |
| `PAYUNI_MERCHANT_ID` | PAYUNi 商家 ID | ✅ | `...` |
| `PAYUNI_HASH_KEY` | PAYUNi Hash Key | ✅ | `...` |
| `PAYUNI_HASH_IV` | PAYUNi Hash IV | ✅ | `...` |
| `PAYUNI_API_URL` | PAYUNi API 端點 | ✅ | `https://api.payuni.com.tw/api/trade` |
| `PAYUNI_RETURN_URL` | 支付完成回調 | ✅ | `https://example.com` |
| `SESSION_SECRET` | Session 加密鑰 | ✅ | `長隨機字串...` |
| `TURNSTILE_ENABLE` | 啟用 Turnstile | ❌ | `true` |
| `TURNSTILE_SECRET_KEY` | Turnstile Secret | ❌ | `...` |
| `WEBHOOK_TOKEN` | Webhook 驗證 Token | ✅ | `...` |
| `LOG_LEVEL` | 日誌級別 | ❌ | `info` |

### Google Cloud 設定

#### 1. 建立服務帳號

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)
2. 建立新專案
3. 啟用 Google Sheets API 與 Google Drive API
4. 建立服務帳號金鑰（JSON 格式）
5. 下載金鑰至 `google-key.json`

#### 2. 共享 Google Sheets

1. 建立新的 Google Sheet（用於儲存訂單與訂閱）
2. 複製 Sheet ID（URL 中的 ID）
3. 與服務帳號郵箱共享編輯權限
4. 記錄 Sheet ID 至環境配置

#### 3. 初始化 Sheets

```bash
# 自動建立必要的工作表與欄位
node init-sheets.js
```

### PAYUNi 設定

#### 1. 設定 Webhook URL

1. 登入 PAYUNi 商家後台
2. 進入 API 設定
3. 設定 Notify URL：`https://your-domain.com/payuni-webhook`
4. 設定 Return URL：`https://your-domain.com/result.html`

#### 2. 驗證簽章

伺服器會自動使用 Hash Key 與 Hash IV 驗證 Webhook 請求。

### 部署建議

#### 使用 PM2 管理進程

```bash
# 安裝 PM2
npm install -g pm2

# 啟動應用
pm2 start index.js --name "payuni-system"

# 設定開機自動啟動
pm2 startup
pm2 save
```

#### 使用 Nginx 反向代理

```nginx
server {
  listen 443 ssl;
  server_name your-domain.com;

  location / {
    proxy_pass http://localhost:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

#### 必須檢查清單

部署前：

- [ ] `NODE_ENV` 已設為 `production`
- [ ] `PAYUNI_API_URL` 指向正式環境
- [ ] SSL 憑證已配置
- [ ] Google Cloud 服務帳號金鑰已配置
- [ ] 所有敏感資訊已妥善保管
- [ ] Webhook URL 公開可訪問
- [ ] Rate Limit 設定已檢查
- [ ] 日誌輪轉已配置

---

## 故障排除

### 常見問題

#### Q1: 啟動時報錯「缺少環境變數」

**解決方案**：
1. 檢查 `.env` 檔案是否存在
2. 確認所有必填變數已設定
3. 檢查值是否正確（無多餘空格）

```bash
# 檢查環境變數
cat .env | grep "REQUIRED"
```

#### Q2: Google OAuth 失敗

**原因**：
- Client ID/Secret 不正確
- Redirect URI 不符合

**解決方案**：
1. 前往 Google Cloud Console
2. 檢查 OAuth 認證設定
3. 確認 Redirect URI 與程式碼一致

```bash
# 正確的 Redirect URI 應為：
https://your-domain.com/auth/google/callback
```

#### Q3: Webhook 未被接收

**原因**：
- Webhook URL 無法公開訪問
- Webhook Token 不符
- 簽章驗證失敗

**解決方案**：
1. 確認 `NOTIFY_URL` 已在 PAYUNi 後台設定
2. 檢查伺服器日誌是否有 Webhook 請求
3. 驗證 Hash Key 與 Hash IV 是否正確

```bash
# 檢查伺服器日誌
npm start  # 查看是否有 Webhook 相關訊息
```

#### Q4: Google Sheets 連線失敗

**原因**：
- 服務帳號金鑰不正確
- Sheet 未與服務帳號共享

**解決方案**：
1. 檢查 `google-key.json` 是否存在
2. 確認 Sheet 已與服務帳號郵箱共享
3. 檢查 API 是否已啟用

```bash
# 初始化 Sheets
node init-sheets.js
```

#### Q5: Rate Limit 被觸發

**原因**：
- 短時間內請求過多

**解決方案**：
等待一段時間後重試，或調整 `src/middleware/security.js` 中的限制設定。

### 除錯技巧

#### 啟用詳細日誌

```bash
LOG_LEVEL=debug npm start
```

#### 檢查 Session

```bash
# 在路由中加入
console.log(req.session);
```

#### 驗證 CSRF Token

```javascript
// 在前端驗證
console.log('CSRF Token:', document.querySelector('input[name="_csrf"]').value);
```

---

## 相關資源

- [Express.js 官方文檔](https://expressjs.com/)
- [Google OAuth 2.0 文檔](https://developers.google.com/identity/protocols/oauth2)
- [Google Sheets API](https://developers.google.com/sheets/api)
- [PAYUNi 開發文檔](https://www.payuni.com.tw/api)
- [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/)
- [Winston 日誌工具](https://github.com/winstonjs/winston)

---

## 支援與反饋

如有問題或建議，請提交 issue 或與開發團隊聯繫。

**維護者**：開發團隊
**版本**：v1.0
**最後更新**：2025-12-02
