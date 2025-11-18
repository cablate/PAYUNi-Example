# 金流整合實戰包 - 部署與設定指南 (v2 - 含使用者登入)

歡迎使用「金流整合實戰包」！本指南將帶您一步步完成所有設定，從零到一成功啟動您的金流服務。

在新版本中，我們加入了完整的 Google 登入系統，讓您的專案更像一個真實的產品。請跟隨以下步驟操作。

---

## 📖 章節索引
- [Part 1: 環境準備](#part-1-環境準備)
- [Part 2: 取得必要的金鑰](#part-2-取得必要的金鑰)
- [Part 3: 專案設定](#part-3-專案設定)
- [Part 4: 啟動與測試](#part-4-啟動與測試)
- [Part 5: 技術堆疊與專案結構](#part-5-技術堆疊與專案結構)

---

## Part 1: 環境準備

在開始之前，請確保您的電腦已安裝以下軟體。

### 1.1 安裝 Node.js
本專案需要 `Node.js` (版本 14 或以上) 來運行後端伺服器。
- **如何檢查版本**：在您的終端機 (Terminal) 或命令提示字元 (CMD) 中輸入 `node -v`。
- **如何安裝**：如果尚未安裝，請前往 [Node.js 官方網站](https://nodejs.org/) 下載並安裝 LTS 版本。

### 1.2 安裝 Git (選配，但強烈建議)
`Git` 是一個版本控制工具，能幫助您更好地管理程式碼。
- **如何安裝**：前往 [Git 官方網站](https://git-scm.com/downloads) 下載並安裝。

---

## Part 2: 取得必要的金鑰

我們的實戰包需要串接幾個外部服務，請依照以下指示取得所有必要的金鑰。

### 2.1 Payuni 商店金鑰 (測試環境)
1.  前往 [Payuni 官方網站](https://www.payuni.com.tw/) 註冊一個開發者帳號。
2.  登入後，在開發者後台找到您的**測試環境**金鑰。
3.  您需要記下以下三項資訊：
    - `商店代號 (Merchant ID)`
    - `HashKey`
    - `HashIV`

### 2.2 Cloudflare Turnstile 金鑰 (人機驗證)
1.  登入您的 [Cloudflare Dashboard](https://dash.cloudflare.com/)。
2.  在左側選單中找到 `Turnstile`。
3.  新增一個站點，並記下以下兩項資訊：
    - `Site Key` (網站金鑰)
    - `Secret Key` (密鑰)

### 2.3 Google Apps Script (GAS) 部署網址 (訂單紀錄)
1.  依照 `@gas/README.md` 文件中的指示，將 `code.gs` 部署為網路應用程式。
2.  複製並記下最終生成的**部署網址 (Deployment URL)**。

### 2.4 Google OAuth 2.0 憑證 (使用者登入)
這是新版加入的功能，用於讓使用者透過 Google 帳號登入。
1.  前往 [Google Cloud Console](https://console.cloud.google.com/)。
2.  建立一個新專案 (如果尚未建立)。
3.  在左上角的選單中，前往「API 和服務」 > 「憑證」。
4.  點擊「+ 建立憑證」，選擇「OAuth 用戶端 ID」。
5.  應用程式類型選擇「網頁應用程式」。
6.  在「已授權的 JavaScript 來源」中，點擊「+ 新增 URI」，並輸入 `http://localhost` (若在本地測試)。
7.  在「已授權的重新導向 URI」中，點擊「+ 新增 URI」，並輸入 `http://localhost/auth/google/callback` (若在本地測試)。
8.  點擊「建立」，您會看到一個彈出視窗，裡面有您的**用戶端 ID** 和**用戶端密鑰**。請將它們複製下來。

---

## Part 3: 專案設定

現在，我們來設定專案本身。

### 3.1 下載並安裝專案
1.  解壓縮您收到的檔案，或使用 Git clone 專案。
2.  在終端機中，進入專案的根目錄。
3.  執行以下指令安裝所有必要的套件：
    ```bash
    npm install
    ```

### 3.2 設定環境變數 `.env`
這是最關鍵的一步。所有敏感的金鑰都將存放在這裡。
1.  在專案根目錄中，找到 `env.example` 檔案。
2.  複製一份並將其重新命名為 `.env`。
3.  打開 `.env` 檔案，並填入您在 Part 2 中取得的所有金鑰：

    ```env
    # 您的網站域名，若在本機測試，可暫時使用 http://localhost
    DOMAIN=http://localhost

    # Payuni 金鑰
    PAYUNI_API_URL=https://sandbox-api.payuni.com.tw/api/trade
    PAYUNI_MERCHANT_ID=... (貼上您的 Payuni 商店代號)
    PAYUNI_HASH_KEY=... (貼上您的 Payuni HashKey)
    PAYUNI_HASH_IV=... (貼上您的 Payuni HashIV)

    # Cloudflare Turnstile 金鑰
    TURNSTILE_ENABLE=true
    TURNSTILE_SECRET_KEY=... (貼上您的 Turnstile Secret Key)

    # Webhook 設定
    NOTIFY_URL=https://your-public-domain.com/payuni-webhook
    PAYUNI_RETURN_URL=http://localhost/result.html
    GAS_WEBHOOK_URL=... (貼上您在 2.3 節取得的 GAS 部署網址)

    # Google OAuth 登入設定
    GOOGLE_CLIENT_ID=... (貼上您的 Google 用戶端 ID)
    GOOGLE_CLIENT_SECRET=... (貼上您的 Google 用戶端密鑰)
    GOOGLE_REDIRECT_URI=http://localhost/auth/google/callback

    # 伺服器與 Session 設定
    NODE_ENV=development
    PORT=80
    LOG_LEVEL=info
    SESSION_SECRET=... (請輸入一個至少 32 字元的隨機字串，非常重要！)
    ```
    **提醒**：`SESSION_SECRET` 可以使用密碼產生器產生一個複雜的隨機字串，它對保護使用者登入狀態至關重要。

### 3.3 設定前端金鑰
1.  打開 `index.html` 檔案。
2.  找到以下這行程式碼：
    ```html
    <div class="cf-turnstile" data-sitekey="YOUR_SITE_KEY"></div>
    ```
3.  將 `YOUR_SITE_KEY` 替換為您在 2.2 節取得的 Cloudflare Turnstile **Site Key**。

---

## Part 4: 啟動與測試

恭喜！所有設定都已完成。

### 4.1 啟動伺服器
在專案根目錄的終端機中，執行以下指令：
```bash
npm start
```
如果一切順利，您會看到一個漂亮的啟動畫面，並提示伺服器已在 `http://localhost` 啟動。

### 4.2 進行第一筆測試
1.  打開您的瀏覽器，訪問 `http://localhost`。
2.  **登入**：首先，完成人機驗證，然後點擊「使用 Google 登入」按鈕並完成登入流程。
3.  **購買**：登入後，您會看到右上角顯示您的頭像與名稱，且「立即購買」按鈕已變為可用。點擊任一商品的按鈕。
4.  **付款**：頁面將自動跳轉至 Payuni 的沙箱支付頁面。使用 Payuni 提供的測試信用卡資訊完成支付。
5.  **查看結果**：支付完成後，頁面會跳轉回您的 `result.html`，並顯示成功訊息。
6.  **查詢訂單**：回到首頁，點擊右上角的「我的訂單」，您應該能看到剛剛完成的購買紀錄。
7.  **檢查資料庫**：您可以前往您的 Google Sheet，檢查是否已成功寫入一筆新的訂單紀錄。

**如果以上步驟都成功，代表您的金流服務已完全準備就緒！**

---

## Part 5: 技術堆疊與專案結構

本專案採用了業界標準且穩定的技術，以確保安全與可維護性。
- **後端**: Express.js, Axios, Winston, Helmet, CORS, CSRF Protection, **express-session**, **google-auth-library**
- **前端**: 原生 JavaScript, HTML, CSS
- **自動化**: Google Apps Script, n8n (範本)
- **加密**: Node.js `crypto` 模組 (AES-256-GCM)

### 專案結構
```
.
├── @gas/             # Google Apps Script 相關
├── @n8n/             # n8n 工作流範本
├── data/             # 商品資料
├── logs/             # 日誌存放目錄
├── public/           # 前端靜態檔案 (CSS, JS)
├── utils/            # 工具函式 (加密、日誌)
├── .env.example      # 環境變數範本
├── DESIGN_PHILOSOPHY.md # 設計理念 (重要！)
├── index.js          # 主要後端伺服器檔案
├── index.html        # 商品列表頁
├── result.html       # 支付結果頁
└── README.md         # 就是本文件
```
