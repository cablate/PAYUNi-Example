# 部署指南 (Deployment Guide)

恭喜您！您已經走到了將專案發佈到全世界的最後一步。部署 (Deployment) 指的是將您的應用程式放置到一台 24 小時運作、可公開存取的伺服器上。

本指南將引導您完成上線前的最終檢查，並以對開發者非常友善的平台 Render.com 為例，示範如何輕鬆完成部署。

---

## 1. 上線前最終檢查清單 (Pre-launch Checklist)

在部署之前，**請務必、務必、務必** 逐項確認以下設定。任何一項的疏漏都可能導致您的正式環境無法正常運作。

所有這些設定都在您的 `.env` 檔案中，或是相關的服務後台。

- **[ ] Payuni 金鑰切換**
    - `PAYUNI_API_URL` 應更新為**正式環境**的網址。
    - `PAYUNI_MERCHANT_ID`, `PAYUNI_HASH_KEY`, `PAYUNI_HASH_IV` 都必須是您 Payuni **正式商店**的金鑰。

- **[ ] 網域與 URL 更新**
    - `DOMAIN`: 必須是您最終的、以 `https://` 開頭的正式網域。
    - `PAYUNI_RETURN_URL`: 必須是您的正式網域加上 `/result.html` (例如 `https://your-domain.com/result.html`)。
    - `GOOGLE_REDIRECT_URI`: 必須是您的正式網域加上 `/auth/google/callback`。

- **[ ] Webhook 公開網址**
    - `NOTIFY_URL`: 必須是一個真實、可公開存取的網址，指向您的後端服務 (例如 `https://your-app-name.onrender.com/payuni-webhook`)。

- **[ ] Google Cloud Console 設定**
    - 前往您的 Google OAuth 2.0 憑證設定頁面。
    - 在「已授權的 JavaScript 來源」中，**新增**您的正式網域 (`https://your-domain.com`)。
    - 在「已授權的重新導向 URI」中，**新增**您的正式重新導向 URI (`https://your-domain.com/auth/google/callback`)。

- **[ ] Cloudflare Turnstile 設定**
    - 前往您的 Turnstile 網站設定，將您的正式網域加入到域名清單中。

- **[ ] 產生全新的 Session Secret**
    - `SESSION_SECRET` **絕對不能**使用開發時的舊字串。請使用密碼產生器生成一個全新的、至少 32 字元以上的超複雜隨機字串。

- **[ ] 設定為正式環境模式**
    - `NODE_ENV`: 將此變數的值設為 `production`。這對效能與安全性至關重要，許多 Node.js 套件（包含 Express）在 `production` 模式下會進行優化並關閉除錯資訊。

---

## 2. 部署平台選擇

對於 Node.js 應用程式，有許多優秀的平台即服務 (PaaS) 可供選擇，它們能讓您專注於程式碼，而非伺服器管理。

- **Render (本指南推薦)**: 提供非常佛心的免費方案、支援從 GitHub 自動部署、環境變數設定介面清晰，對 Node.js 專案的支援度極佳。
- **Heroku**: 經典的 PaaS 平台，非常穩定，但近年免費方案有所縮減。
- **Vercel / Netlify**: 對於純靜態網站或無伺服器函式 (Serverless Functions) 是絕佳選擇。但對於需要持續運行的 Express 伺服器，Render 或 Heroku 更為直覺。
- **VPS (如 DigitalOcean, Linode)**: 適合希望完全掌控伺服器環境的進階使用者。這需要您手動安裝 Node.js、設定 Nginx 反向代理、使用 PM2 進行程序管理等。

---

## 3. 部署範例：使用 Render.com

我們將以 Render 為例，示範如何將您的專案部署上線。

**第 1 步：準備您的專案**
1.  確保您的專案已經上傳到一個 GitHub (或 GitLab) 儲存庫 (Repository)。
2.  確認 `package.json` 中有 `start` 指令：`"start": "node index.js"`。
3.  確認 `index.js` 中監聽的 Port 是來自環境變數：`const PORT = process.env.PORT || 80;` (本專案已為您設定好)。

**第 2 步：建立 Render 帳號並連結 GitHub**
1.  前往 [Render.com](https://render.com/) 註冊一個新帳號。
2.  在註冊流程或儀表板中，授權 Render 存取您的 GitHub 帳號。

**第 3 步：建立一個新的 "Web Service"**
1.  在 Render 儀表板，點擊 "New +" 按鈕，然後選擇 "Web Service"。
2.  選擇您存放此專案的 GitHub 儲存庫並點擊 "Connect"。

**第 4 步：設定 Web Service**
1.  **Name**: 為您的服務取一個獨一無二的名稱，例如 `my-payment-app`。這將成為您初始網址的一部分。
2.  **Region**: 選擇離您目標客群最近的伺服器地區。
3.  **Branch**: 選擇您要部署的分支 (通常是 `main` 或 `master`)。
4.  **Runtime**: Render 會自動偵測為 `Node`。
5.  **Build Command**: `npm install` (Render 通常會自動填寫)。
6.  **Start Command**: `npm start` (Render 通常會自動填寫)。
7.  **Instance Type**: 選擇 `Free` 方案開始。

**第 5 步：設定環境變數 (最重要的一步！)**
1.  在設定頁面中，找到 "Environment" 或 "Advanced" 區塊。
2.  點擊 "Add Environment Variable"。
3.  將您 **`.env` 檔案中的每一個變數**，逐一新增到 Render 的環境變數設定中。
    - **Key**: 變數名稱 (例如 `PAYUNI_MERCHANT_ID`)
    - **Value**: 您在「上線前最終檢查清單」中確認過的 **正式環境** 的值。
4.  **重複此步驟**，直到您 `.env` 中的所有變數都已安全地設定在 Render 上。

**第 6 步：部署與取得公開網址**
1.  點擊頁面最下方的 "Create Web Service" 按鈕。
2.  Render 會開始拉取您的程式碼、執行 `npm install`，然後執行 `npm start`。您可以在 "Logs" 分頁中查看即時進度。
3.  幾分鐘後，當日誌顯示您的伺服器已成功啟動，部署就完成了！
4.  在您的服務頁面頂端，Render 會提供您一個公開網址，格式為 `https://your-app-name.onrender.com`。
5.  **最後一步**：將這個公開網址，更新回您在 Google、Cloudflare 以及 Render 環境變數 `NOTIFY_URL` 中所有需要填寫您服務網址的地方。

---

### 結論

恭喜您！您的金流服務已經在網際網路上線運作。部署過程有時會遇到預期外的問題，請善用 Render 提供的 "Logs" 功能來診斷問題。穩固的架構加上清晰的部署流程，是您商業點子成功的基石。