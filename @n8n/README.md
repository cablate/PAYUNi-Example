# n8n 工作流實戰指南：視覺化您的訂單管理流程

歡迎來到 n8n 指南！如果您不喜歡寫程式，但又想實現與 GAS 類似的自動化訂單管理，那麼 n8n 將是您的最佳選擇。

n8n 是一個視覺化的工作流自動化工具，您可以透過拖拉節點的方式，建立強大的自動化流程。本專案提供的 `index.json` 就是一個預先為您建立好的 n8n 工作流範本。

**核心功能**：
與 GAS 版本完全相同，但全程視覺化，更易於理解與修改。
- **自動建立訂單**
- **自動更新狀態**
- **訂單查詢**

---

## Part 1: 準備 n8n 環境

您可以選擇使用 n8n 的雲端版本或自行託管。對於初學者，我們推薦直接使用雲端版，或透過 [Zeabur](https://zeabur.com/) 等平台一鍵部署。

1.  **註冊 n8n 帳號**：前往 [n8n 官方網站](https://n8n.io/) 註冊一個免費的雲端版帳號。
2.  **建立 Google Sheets 憑證**：
    - 在 n8n 的儀表板左側，找到「Credentials」並點擊「Add credential」。
    - 搜尋「Google Sheets」，並選擇「Google Sheets OAuth2 API」。
    - 依照 n8n 的指示，登入您的 Google 帳號，並授權 n8n 存取您的 Google Sheets。這一步是為了讓 n8n 能夠讀寫您的訂單試算表。

---

## Part 2: 匯入並設定工作流

1.  **建立空白工作流**：在 n8n 中，建立一個新的、空白的工作流 (Workflow)。

2.  **匯入範本**：
    - 點擊畫布右上角的三個點 `...`，選擇「Import from file」。
    - 選擇本專案 `@n8n` 資料夾下的 `index.json` 檔案並匯入。

3.  **設定 Google Sheets 節點**：
    - 匯入後，您會看到畫布上出現了許多節點。找到所有名稱包含 `Google Sheets` 或 `Find-`、`Create-`、`Update-` 的節點（例如 `Find-ToBePaid`, `Create-Order` 等）。
    - 逐一點開這些節點，您會看到「Credential」欄位。請從下拉選單中，選擇您在 Part 1-2 建立的 Google Sheets 憑證。
    - 在「Sheet Name」欄位，點擊右側的重新整理按鈕，然後從下拉選單中選擇您用於記錄訂單的那個試算表與分頁（例如「訂單記錄」）。
    - **對每一個 Google Sheets 節點重複此操作**，直到所有節點都已正確關聯到您的帳號和試算表。

4.  **啟用工作流**：
    - 點擊畫面右上角的「Save」按鈕保存您的設定。
    - 將左上角的開關從「Inactive」切換為「Active」。

5.  **複製 Webhook URL**：
    - 點擊最左側的「Webhook」節點。
    - 在右側的面板中，您會看到「Test URL」和「Production URL」。請複製「**Production URL**」。
    - 這個 URL 就是我們需要的 Webhook 網址。

---

## Part 3: 整合至後端專案

與 GAS 的設定方式完全相同。

1.  打開專案根目錄的 `.env` 檔案。
2.  找到 `GAS_WEBHOOK_URL` 這個變數（是的，我們共用同一個變數名以簡化設定）。
3.  將您在 Part 2-5 複製的 n8n Production URL，貼到等號後面。
    ```env
    GAS_WEBHOOK_URL=https://your-n8n-instance.com/webhook/your-production-webhook-id
    ```
4.  儲存 `.env` 檔案，並**重新啟動您的 Node.js 伺服器**。

---

## Part 4: 工作流節點解析

這個工作流的核心是一個「Switch」節點，它會根據收到的請求 (`action` 參數)，將流程導向不同的分支：

-   **`findOrder` 分支**：
    -   **Find-ToBePaid (Google Sheets)**: 查找具有相同 Email 和商品 ID 的「待支付」訂單。
    -   **If**: 判斷是否找到訂單。
    -   **Respond Order / Respond NotFound (Respond to Webhook)**: 根據結果回傳訂單資訊或「找不到」的訊息。

-   **`createOrder` 分支**：
    -   **Create-Order (Google Sheets)**: 在試算表中新增一筆狀態為「待支付」的訂單。
    -   **Respond CreateSuccess / Respond CreateFailed (Respond to Webhook)**: 回傳成功或失敗的訊息。

-   **`updateOrder` 分支**：
    -   **Find-Order (Google Sheets)**: 根據 Payuni 通知中的訂單編號，找到對應的訂單。
    -   **Update-Order (Google Sheets)**: 更新該筆訂單的狀態、完成時間等資訊。
    -   **Respond UpdateSuccess / Respond UpdateFailed (Respond to Webhook)**: 回傳成功或失敗的訊息。

透過這個視覺化的流程，您可以非常輕易地理解資料的流向，並在未來根據需求，自行拖拉新的節點（例如，在更新訂單後，自動發送一封 Email 通知）來擴充功能。
