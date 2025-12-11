# 金流串接範例程式碼

> **定位**：課程範例程式碼，供學員學習金流串接流程
> **版本**：v1.0
> **最後更新**：2025-12-10

---

## 這是什麼？

這是一套**金流串接課程的教學範例程式碼**，展示如何實作：

- Google OAuth 登入
- 建立訂單並跳轉至金流頁面付款
- 接收 Webhook 回調並更新資料庫
- 查詢訂單與訂閱狀態

**本專案採用 Google Sheets 作為資料庫**，目的是降低學習門檻，讓學員無需安裝 MySQL/PostgreSQL 即可快速體驗完整的金流串接流程。

---

## 適合誰？

| 對象 | 說明 |
|------|------|
| **工程師** | 想了解金流串接流程的開發者 |
| **Vibe Coder** | 用 AI 輔助開發、想快速上手金流的非傳統工程師 |
| **創業者** | 想在自己的產品中加入付款功能，先用範例練手 |

---

## 功能清單

### 已實作（可直接使用）

| 功能 | 說明 | 狀態 |
|------|------|------|
| Google OAuth 登入 | 使用者以 Google 帳號登入 | ✅ 完成 |
| 一次性支付 | 建立訂單 → 跳轉 PAYUNi → 完成付款 | ✅ 完成 |
| 訂閱制支付 | 建立訂閱訂單（首期扣款） | ✅ 完成 |
| Webhook 接收 | 接收金流回調、驗證簽章、更新資料 | ✅ 完成 |
| 訂單查詢 | 使用者查看自己的訂單紀錄 | ✅ 完成 |
| 訂閱查詢 | 使用者查看訂閱狀態 | ✅ 完成 |
| 權益授予 | 付款成功後自動授予使用者權益 | ✅ 完成 |
| 安全防護 | CSRF、Rate Limit、Helmet、Turnstile | ✅ 完成 |

### 未實作（需自行擴充）

| 功能 | 說明 | 狀態 |
|------|------|------|
| 退款流程 | 透過 API 發起退款 | ❌ 未實作 |
| 補償機制 | Webhook 失敗時的手動補單腳本 | ❌ 未實作 |
| 錯誤通知 | Webhook 處理失敗時發送通知（Email/Slack） | ❌ 未實作 |
| 發票開立 | 串接電子發票 API | ❌ 未實作 |
| 後台管理 | 管理員查看所有訂單的 Dashboard | ❌ 未實作 |

---

## 技術架構

```
使用者瀏覽器
    ↓
Google OAuth 登入
    ↓
Express 伺服器 ←→ Google Sheets（資料儲存）
    ↓
PAYUNi 金流（付款頁面）
    ↓
Webhook 回調 → 更新 Google Sheets → 授予權益
    ↓
支付結果頁面
```

### 技術棧

| 層級 | 技術 |
|------|------|
| 後端 | Node.js + Express.js (TypeScript) |
| 認證 | Google OAuth 2.0 + express-session |
| 金流 | PAYUNi |
| 資料庫 | Google Sheets API（輕量級方案） |
| 安全 | Helmet、express-rate-limit、CSRF、Turnstile |
| 前端 | HTML + CSS + Vanilla JavaScript |

---

## 專案限制（請務必了解）

### 這是範例程式碼，不是生產系統

| 限制 | 說明 |
|------|------|
| **Google Sheets 效能** | 不適合高併發場景（每分鐘 100+ 筆寫入可能會有問題） |
| **無資料庫交易** | Google Sheets 無 ACID 交易支援，極端情況可能資料不一致 |
| **無訂閱續期** | 只處理首期扣款，後續週期扣款需自行實作或串接金流定期定額 |
| **無完整錯誤處理** | 部分錯誤情境未做細緻處理 |
| **Session 存在記憶體** | 伺服器重啟會清除 Session，生產環境應改用 Redis |

### 升級到生產環境建議

如果你要把這套程式碼用於真實產品，建議：

1. **換掉 Google Sheets** → 改用 PostgreSQL / MySQL / MongoDB
2. **Session 改用 Redis** → 避免重啟後 Session 遺失
3. **加入訂閱排程** → 使用 cron job 或金流商的定期定額功能
4. **完善錯誤處理** → 加入 Sentry 等錯誤監控
5. **補單機制** → 實作 Webhook 失敗時的補償腳本

---

## 快速開始

### 前置需求

- Node.js 18+
- npm 或 yarn
- Google Cloud 專案（OAuth + Sheets API）
- PAYUNi 商家帳號（沙箱環境即可測試）

### 步驟 1：環境設定

```bash
# 複製範本
cp .env.example .env

# 編輯 .env，填入你的金鑰
```

必填環境變數：

```bash
# Google OAuth
GOOGLE_CLIENT_ID=你的_Client_ID
GOOGLE_CLIENT_SECRET=你的_Client_Secret
GOOGLE_REDIRECT_URI=https://你的網域/auth/google/callback

# PAYUNi 金流
PAYUNI_MERCHANT_ID=商家ID
PAYUNI_HASH_KEY=32字元金鑰
PAYUNI_HASH_IV=16字元IV
PAYUNI_API_URL=https://sandbox-api.payuni.com.tw/api/trade

# 其他
DOMAIN=https://你的網域
SESSION_SECRET=隨機長字串至少32字元
```

### 步驟 2：安裝與啟動

```bash
# 安裝依賴
npm install

# 開發模式（自動重載）
npm run dev

# 或正式啟動
npm start
```

### 步驟 3：測試支付

1. 開啟 http://localhost（或你的網域）
2. 使用 Google 帳號登入
3. 選擇商品並前往付款
4. 使用 PAYUNi 沙箱測試卡號：
   - 卡號：`4111111111111111`
   - 有效期：`12/25`
   - CVV：`123`

---

## 資料夾結構

```
金流串接/
├── index.ts                    # 應用進入點
├── src/
│   ├── config/                 # 設定檔
│   ├── data/products.ts        # 商品資料
│   ├── middleware/             # 中間件（安全、錯誤處理）
│   ├── routes/                 # API 路由
│   │   ├── auth.ts             # Google OAuth
│   │   ├── payment.ts          # 支付與 Webhook
│   │   ├── orders.ts           # 訂單查詢
│   │   └── subscriptions.ts    # 訂閱管理
│   ├── services/
│   │   ├── database/           # Google Sheets 操作
│   │   └── payment/            # PAYUNi SDK
│   └── utils/                  # 工具函數
├── _frontend/
│   ├── index.html              # 首頁（登入 + 選擇商品）
│   ├── result.html             # 支付結果頁
│   ├── orders.html             # 訂單查詢頁
│   ├── subscriptions.html      # 訂閱管理頁
│   └── public/                 # CSS、JS、圖片
└── .env.example                # 環境變數範本
```

---

## API 概覽

| 端點 | 方法 | 說明 |
|------|------|------|
| `/auth/google` | GET | 發起 Google OAuth 登入 |
| `/api/me` | GET | 取得目前登入的使用者資訊 |
| `/create-payment` | POST | 建立一次性支付訂單 |
| `/create-subscription` | POST | 建立訂閱訂單 |
| `/payuni-webhook` | POST | 接收 PAYUNi Webhook 回調 |
| `/api/orders` | GET | 查詢使用者訂單 |
| `/api/subscriptions` | GET | 查詢使用者訂閱 |
| `/api/order-result/:token` | GET | 取得支付結果詳情 |

詳細 API 文檔請參考 `webhookDoc.md`。

---

## 常見問題

### Q：為什麼用 Google Sheets 不用資料庫？

這是**教學用範例**。Google Sheets 的優點：
- 無需安裝資料庫軟體
- 可以直接在試算表看到資料變化
- 適合快速原型驗證

但生產環境請務必換成正規資料庫。

### Q：Webhook 沒有收到怎麼辦？

1. 確認 PAYUNi 後台的 Notify URL 設定正確
2. 確認你的伺服器可以被外網訪問（本機測試可用 ngrok）
3. 檢查伺服器日誌看有沒有收到請求

### Q：如何切換到正式環境？

1. 將 `PAYUNI_API_URL` 改為 `https://api.payuni.com.tw/api/trade`
2. 更換為正式的商家金鑰
3. 將 `NODE_ENV` 設為 `production`

---

## 課程配套說明

本程式碼為課程「PAYUNi 金流串接實戰」的範例程式碼，課程內容涵蓋：

1. **流程講解**：完整說明金流串接的運作原理
2. **逐步實作**：從零開始建立這套系統
3. **部署教學**：如何將程式碼部署到雲端平台

學員可以直接部署此程式碼，或參考程式碼結構自行實作。

---

## 授權與支援

**維護者**：課程團隊
**授權**：僅供課程學員使用
**問題回報**：請透過課程討論區或 Email 聯繫

---

## 更新紀錄

| 日期 | 版本 | 變更 |
|------|------|------|
| 2025-12-10 | v1.0 | 初始版本發布 |
