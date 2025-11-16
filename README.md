# 金流整合實戰包 - 價值啟動指南 (v2)

恭喜您！歡迎使用「金流整合實戰包」。這不僅僅是一份程式碼，而是一套為您精心打造、可以直接投入真實商業環境的解決方案。

我們將引導您完成所有設定，並深入探索這套系統的價值所在，讓您不僅能成功啟動服務，更能充滿信心地將其客製化、部署上線。

---

## 📖 章節索引
- [Part 0: 歡迎與起點](#part-0-歡迎與起點)
- [Part 1: 環境準備與安裝](#part-1-環境準備與安裝)
- [Part 2: 核心金鑰設定](#part-2-核心金鑰設定)
- [Part 3: 啟動與本地測試](#part-3-啟動與本地測試)
- [Part 4: 深入導覽與客製化](#part-4-深入導覽與客製化)
- [Part 5: 從測試到正式上線](#part-5-從測試到正式上線)
- [附錄：常見問題與支援](#附錄-常見問題與支援)

---

## Part 0: 歡迎與起點

在開始動手設定前，讓我們先花幾分鐘了解您所獲得的這套系統的設計理念與價值。

### 0.1 這是一套解決方案，不僅是程式碼
我們整合了金流、使用者登入、人機驗證與自動化訂單紀錄，並內建了多層次的安全防護。您獲得的是一套解決了真實世界問題的即戰力方案。

### 0.2 系統藍圖
您的金流服務將由以下幾個部分協同工作：
1.  **使用者** 在您的網站上透過 **Google** 登入。
2.  通過 **Cloudflare Turnstile** 的無感人機驗證。
3.  在您的 **Node.js (Express)** 伺服器上建立訂單。
4.  跳轉至 **Payuni** 支付頁面完成付款。
5.  付款成功後，**Payuni Webhook** 通知您的伺服器。
6.  伺服器驗證通知，並透過 **Google Apps Script (GAS)** 將訂單安全地寫入您的 **Google Sheet**。

### 0.3 設計理念
我們選擇了穩定、主流且具成本效益的技術堆疊，以確保您的服務安全、可靠且易於維護。想了解更多技術選型的細節，請參閱 `@@docs/00_DESIGN_PHILOSOPHY.md`。

---

## Part 1: 環境準備與安裝

### 1.1 安裝 Node.js
本專案需要 `Node.js` (版本 14 或以上)。
- **檢查版本**: 在終端機輸入 `node -v`。
- **安裝**: 前往 [Node.js 官方網站](https://nodejs.org/) 下載並安裝 LTS 版本。

### 1.2 下載並安裝專案
1.  解壓縮您收到的檔案，或使用 `git clone`。
2.  在終端機中，進入專案根目錄。
3.  執行以下指令安裝所有必要的套件：
    ```bash
    npm install
    ```

---

## Part 2: 核心金鑰設定

現在，我們來取得串接所有外部服務所需的金鑰。

### 2.1 Payuni 商店金鑰
- **用途**: 處理核心的金流交易。
- **步驟**:
    1. 前往 [Payuni 官網](https://www.payuni.com.tw/) 註冊開發者帳號。
    2. 在後台找到 **測試環境** 的 `商店代號 (Merchant ID)`、`HashKey`、`HashIV`。

### 2.2 Google OAuth 2.0 憑證
- **用途**: 提供安全、可信賴的使用者 Google 登入功能。
- **步驟**:
    1. 前往 [Google Cloud Console](https://console.cloud.google.com/) 建立一個 OAuth 2.0 用戶端 ID。
    2. 應用程式類型選擇「網頁應用程式」。
    3. 在「已授權的 JavaScript 來源」中新增 `http://localhost`。
    4. 在「已授權的重新導向 URI」中新增 `http://localhost/auth/google/callback`。
    5. 記下您的 `用戶端 ID` 和 `用戶端密鑰`。

### 2.3 Cloudflare Turnstile 金鑰
- **用途**: 取代傳統惱人的 Captcha，在不犧牲安全性的前提下提升使用者體驗。
- **步驟**:
    1. 登入 [Cloudflare Dashboard](https://dash.cloudflare.com/)，在 `Turnstile` 選單中新增站點。
    2. 記下 `Site Key` (網站金鑰) 和 `Secret Key` (密鑰)。

### 2.4 Google Apps Script (GAS) 部署網址
- **用途**: 作為一個無伺服器、免費且安全的資料庫，用於儲存訂單紀錄。
- **步驟**:
    1. 依照 `@gas/README.md` 的指示，將 `code.gs` 部署為網路應用程式。
    2. 複製並記下最終生成的 **部署網址**。

---

## Part 3: 啟動與本地測試

### 3.1 設定環境變數 `.env`
這是最關鍵的一步。所有敏感的金鑰都將存放在這裡。
1.  在專案根目錄中，複製 `env.example` 並重新命名為 `.env`。
2.  打開 `.env` 檔案，填入您在 Part 2 取得的所有金鑰與資訊：

    ```env
    # Payuni 金鑰
    PAYUNI_MERCHANT_ID=...
    PAYUNI_HASH_KEY=...
    PAYUNI_HASH_IV=...

    # Google OAuth
    GOOGLE_CLIENT_ID=...
    GOOGLE_CLIENT_SECRET=...

    # Cloudflare Turnstile
    TURNSTILE_SECRET_KEY=...

    # Google Apps Script
    GAS_WEBHOOK_URL=...

    # 您的服務網域與回呼網址
    DOMAIN=http://localhost
    PAYUNI_RETURN_URL=http://localhost/result.html
    GOOGLE_REDIRECT_URI=http://localhost/auth/google/callback
    NOTIFY_URL=https://your-public-domain.com/payuni-webhook # 上線時需要一個公開網址

    # 伺服器與 Session 設定
    PORT=80
    SESSION_SECRET=... # 請輸入一個至少 32 字元的隨機字串
    ```
    **提醒**: `SESSION_SECRET` 對保護使用者登入狀態至關重要，請務必使用密碼產生器生成一個複雜的隨機字串。

### 3.2 設定前端金鑰
1.  打開 `index.html` 檔案。
2.  將 `<div class="cf-turnstile" data-sitekey="YOUR_SITE_KEY"></div>` 中的 `YOUR_SITE_KEY` 替換為您的 Cloudflare Turnstile **Site Key**。

### 3.3 啟動伺服器
在專案根目錄的終端機中，執行 `npm start`。如果一切順利，您會看到伺服器已在 `http://localhost` 啟動。

### 3.4 進行第一筆測試
1.  打開瀏覽器，訪問 `http://localhost`。
2.  **登入**: 點擊「使用 Google 登入」並完成流程。
3.  **購買**: 點擊任一商品的「立即購買」按鈕。
4.  **付款**: 在 Payuni 沙箱頁面使用測試信用卡完成支付。
5.  **驗證**:
    - 頁面跳轉回 `result.html` 並顯示成功訊息。
    - 回到首頁，點擊「我的訂單」應能看到購買紀錄。
    - 前往您的 Google Sheet，檢查是否已成功寫入一筆新訂單。

**做得好！您的測試環境已順利運作。接下來，讓我們帶您探索如何將它變成您自己的產品。**

---

## Part 4: 深入導覽與客製化

這部分將幫助您掌握修改與擴充的能力，這是此實戰包的核心價值。

- **專案結構深度解析**:
  想了解每個資料夾與重要檔案的用途嗎？請參閱 `@@docs/01_SYSTEM_ARCHITECTURE.md`。

- **如何新增/修改商品?**
  所有商品資料都存放在 `data/products.js` 中。您可以直接修改此檔案來變更商品內容。

- **安全性設計**:
  我們已為您內建了 CSRF 保護、Helmet 安全標頭等多項機制。想深入了解它們如何保護您的網站？請閱讀 `@@docs/02_SECURITY_DEEP_DIVE.md`。

- **客製化你的網站**:
  需要更詳細的指南來調整前端樣式或串接其他服務嗎？`@@docs/03_CUSTOMIZATION_GUIDE.md` 為您準備了詳細步驟。

---

## Part 5: 從測試到正式上線

恭喜您準備好邁向下一步！在將您的服務部署到真實世界前，請務必完成以下檢查。

### 5.1 上線檢查清單 (Checklist)
- [ ] 將 Payuni 金鑰從 **測試** 環境切換為 **正式** 環境。
- [ ] 在 `.env` 中，將 `DOMAIN`、`PAYUNI_RETURN_URL` 等網址從 `http://localhost` 更新為您的 **正式網域** (必須是 `https://`)。
- [ ] 在 Google Cloud Console 中，將您的正式網域加入到 OAuth 的「已授權...」清單中。
- [ ] 確保 `.env` 中的 `NOTIFY_URL` 是一個真實、可公開存取的網址。
- [ ] 產生一個全新的、超級複雜的 `SESSION_SECRET`。
- [ ] 將 `.env` 中的 `NODE_ENV` 改為 `production`。

### 5.2 部署建議
您可以將此專案部署到任何支援 Node.js 的平台。想查看在 Render.com 上的部署範例嗎？請參閱 `@@docs/04_DEPLOYMENT.md`。

---

## 附錄：常見問題與支援

- **Q: `npm install` 失敗怎麼辦?**
  A: 請嘗試刪除 `node_modules` 資料夾與 `package-lock.json` 檔案，然後重新執行 `npm install`。若問題持續，請檢查您的 Node.js 版本是否符合要求。

- **Q: Payuni 回傳錯誤怎麼辦?**
  A: 請登入 Payuni 後台，查詢交易失敗的原因。常見問題包含 IP 白名單未設定、Hash 值計算錯誤等。

- **Q: 需要進一步的支援嗎?**
  A: [請在此處填寫您的支援管道，例如 Email 或學員社群連結]