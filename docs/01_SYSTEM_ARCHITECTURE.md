# 系統架構 

本文件旨在提供「金流整合實戰包」一個清晰的架構。
理解各個環節如何互動，是後續進行客製化、問題排查與功能擴充的關鍵。

---

## 1. 核心元件拆解

我們的系統主要由以下幾個核心元件組成：

| 元件 | 技術/服務 | 扮演的角色 |
| :--- | :--- | :--- |
| **前端 (Frontend)** | `HTML`, `CSS`, `JavaScript` | **使用者介面**：呈現商品、處理 Google 登入、觸發購買流程、跳轉 Payuni UPP 支付頁面、顯示支付結果。 |
| **後端 (Backend)** | `Node.js` / `Express.js` | **伺服器中心**：串連所有服務的核心，負責處理業務邏輯、驗證與安全性。 |
| **支付閘道** | `Payuni API` | **金流方**：接收訂單資訊並建立付款頁面，於金流方平台進行實際的支付流程，我們的系統不經手任何支付過程。 |
| **身份驗證** | `Google OAuth 2.0` | **使用者身份**：提供一個安全、可信賴的第三方登入機制，避免惡意註冊、以及增加資料管理成本。 |
| **人機驗證** | `Cloudflare Turnstile` | **流量守門員**：以對使用者友善的方式 (非 Recaptcha)，過濾惡意機器人流量。 |
| **資料庫** | `Google Apps Script / n8n` + `Sheet` | **訂單資料儲存**：一個無伺服器、高可用性且免費的訂單儲存解決方案。 |

---

## 2. 核心流程詳解

理解以下三個核心流程，您就能掌握整個系統的運作精髓。

### 流程一：使用者登入 (Google OAuth 2.0)

![使用者登入流程](https://i.imgur.com/example.png)  <!-- 這是一個示意，實際不會顯示圖片 -->

1.  **觸發**：使用者在 `index.html` 上點擊「使用 Google 登入」。
2.  **重導向至 Google**：瀏覽器被導向至 Google 的身份驗證頁面。
3.  **使用者授權**：使用者在 Google 頁面登入並同意授權。
4.  **回呼 (Callback)**：Google 將使用者導回至我們後端設定的 `GOOGLE_REDIRECT_URI` (`/auth/google/callback`)，並附帶一個授權碼 (Authorization Code)。
5.  **後端驗證**：我們的 Express 伺服器收到授權碼後，在後端向 Google 交換存取權杖 (Access Token)，並用權杖取得使用者資料（名稱、頭像等）。
6.  **建立 Session**：伺服器為該使用者建立一個 Session，並將使用者資訊存入其中，同時向瀏覽器發送一個加密的 Session Cookie。
7.  **重導向至首頁**：伺服器將使用者導回網站首頁。前端偵測到登入狀態，更新 UI，顯示使用者名稱與頭像。

### 流程二：建立訂單與前往支付

1.  **觸發**：已登入的使用者在 `index.html` 上點擊「立即購買」。
2.  **前端請求**：前端 JavaScript 向後端的 `/api/create-order` 端點發起一個 `POST` 請求，請求中包含商品 ID 與 CSRF Token。
3.  **後端處理**：
    a. 伺服器驗證使用者的 Session 與 CSRF Token，確保請求合法。
    b. 根據商品 ID 從 `data/products.js` 查找價格與商品名稱。
    c. 產生一筆新的訂單資料，包含唯一的訂單號 (`MerchantOrderNo`)。
    d. 將訂單資料與 Payuni 的 `HashKey` 及 `HashIV` 進行加密，產生 `TradeInfo` (加密後的訂單) 與 `TradeSha` (簽名)。
4.  **回傳給前端**：後端將 `TradeInfo`、`TradeSha` 及 Payuni 的 API 端點等必要資訊回傳給前端。
5.  **跳轉至 Payuni**：前端收到後端的回應後，會動態建立一個表單，並自動將這些資訊 `POST` 到 Payuni 的支付頁面。此時，使用者的瀏覽器畫面會從您的網站跳轉到 Payuni 的網站。

### 流程三：支付確認與訂單紀錄 (Webhook)

這是整個流程中最關鍵的一步，它確保了交易的最終一致性。

1.  **使用者支付**：使用者在 Payuni 頁面輸入信用卡資訊並完成支付。
2.  **兵分兩路**：
    *   **路徑 A (前端)**：Payuni 將使用者的瀏覽器導回到您指定的 `PAYUNI_RETURN_URL` (`result.html`)。**這僅用於提供即時的使用者體驗，不應作為訂單成功的依據。**
    *   **路徑 B (後端 - 真實的交易通知)**：在背景，Payuni 的伺服器會向您在 `.env` 中設定的 `NOTIFY_URL` (`/payuni-webhook`) 發送一個 `POST` 請求。這就是「Webhook」，是唯一可信的交易結果通知。
3.  **後端接收 Webhook**：您的 Express 伺服器接收到這個 Webhook 請求。
4.  **解密與驗證**：伺服器使用 `utils/crypto.js` 中的 AES-256-GCM 解密函式，對 Webhook 內容進行解密與驗證。這一步確保了通知確實來自 Payuni 且內容未被篡改。
5.  **確認訂單成功**：驗證成功後，後端即可 100% 確認這筆訂單已支付成功。
6.  **觸發 GAS**：後端將訂單號、金額、商品名稱、使用者等關鍵資訊，整理成一個乾淨的 JSON 物件。
7.  **寫入 Google Sheet**：後端向您在 `.env` 中設定的 `GAS_WEBHOOK_URL` 發起一個 `POST` 請求，將上述 JSON 物件傳送過去。
8.  **GAS 執行**：部署在雲端的 Google Apps Script 被觸發，執行 `doPost` 函式，將接收到的 JSON 資料新增一行到您指定的 Google Sheet 中，完成訂單的最終紀錄。

---

## 3. 專案檔案結構解析

```
.
├── @@docs/           # 深度導覽文件 (就是這裡)
├── @gas/             # Google Apps Script 相關，您的無伺服器資料庫
│   └── code.gs       # 接收後端通知並寫入 Sheet 的邏輯
├── @n8n/             # (選配) n8n 自動化工作流範本
├── data/             # 您的商品目錄
│   └── products.js   # 在此新增或修改商品
├── logs/             # 伺服器日誌存放目錄，用於問題排查
├── public/           # 前端靜態檔案 (CSS, JS, 圖片等)
│   ├── app.js        # 前端主要邏輯 (如點擊事件、API 請求)
│   └── result.js     # 支付結果頁的邏輯
├── utils/            # 後端共用的工具函式
│   ├── crypto.js     # 核心加密/解密函式 (AES-256-GCM)
│   └── logger.js     # 日誌記錄器設定 (Winston)
├── .env.example      # 環境變數的範本，所有機敏資訊都在此設定
├── index.js          # Express 後端主應用程式，所有 API 端點與邏輯的入口
├── index.html        # 主要商品頁 (首頁)
├── result.html       # 支付結果頁
└── package.json      # 專案依賴與腳本設定
```

理解這個架構後，您就能清晰地知道，當需要修改某個功能時，應該從哪個檔案或哪個資料夾著手。