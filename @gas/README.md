# Google Apps Script (GAS) 實戰指南：自動化您的訂單管理 (v2)

歡迎來到 GAS 指南！本節將帶您一步步設定 Google Apps Script，將其變成一個強大的、自動化的訂單紀錄與管理中心。

**v2 版新功能**：
- **查詢個人訂單**：新增 `getMyOrders` API，讓登入的使用者可以查詢自己的歷史訂單。

---

## Part 1: 建立並初始化 Google Sheet

1.  **建立試算表**：前往 [Google Sheets](https://sheets.google.com/)，建立一份新的空白試算表。您可以將它命名為「金流專案訂單紀錄」。
2.  **記下試算表 ID**：觀察瀏覽器網址列，它的結構會像這樣：
    `https://docs.google.com/spreadsheets/d/THIS_IS_YOUR_SHEET_ID/edit`
    請複製 `d/` 和 `/edit` 之間的那長串亂碼，這就是您的 **Sheet ID**。

---

## Part 2: 設定 Google Apps Script

1.  **打開 Apps Script 編輯器**：
    - 在您剛剛建立的 Google Sheet 頁面中，點擊頂部選單的「擴充功能」 > 「Apps Script」。
    - 這會在新分頁中打開一個程式碼編輯器。

2.  **貼上程式碼**：
    - 將編輯器中原有的所有內容刪除。
    - 將本專案 `@gas` 資料夾下的 `code.gs` 檔案內容，**完整地**複製並貼到編輯器中。

3.  **設定您的 Sheet ID**：
    - 在程式碼的最上方，找到這一行：
      ```javascript
      const SHEET_ID = "";
      ```
    - 將您在 Part 1-2 記下的 **Sheet ID**，貼到引號中間。
      ```javascript
      // 範例
      const SHEET_ID = "1aBcDeFgHiJkLmNoPqRsTuVwXyZ_1234567890";
      ```
    - 按下 `Ctrl + S` 或點擊上方的「儲存專案」圖示，保存您的變更。

4.  **初始化工作表**：
    - 在編輯器頂部的函式選擇下拉選單中，選擇 `initializeSheet` 函式。
    - 點擊旁邊的「▶️ 執行」按鈕。
    - **首次執行會要求授權**：
        - Google 會彈出一個「需要授權」的視窗，請點擊「審查權限」。
        - 選擇您的 Google 帳號。
        - Google 可能會顯示一個「Google 尚未驗證這個應用程式」的警告畫面。這是正常的，因為這是您自己寫的腳本。請點擊左下角的「進階」，然後點擊「前往『(您的專案名稱)』(不安全)」。
        - 在最後的授權畫面中，點擊「允許」。
    - 執行完畢後，回到您的 Google Sheet，您會發現多了一個名為「訂單記錄」的分頁，並且表頭都已自動建立好。

---

## Part 3: 部署為網路應用程式 (Webhook)

這是最關鍵的一步，它會將您的腳本變成一個可以從外部網路存取的 API。

1.  **開始部署**：
    - 在 Apps Script 編輯器的右上角，點擊藍色的「部署」按鈕。
    - 選擇「新增部署作業」。

2.  **設定部署選項**：
    - 在彈出的視窗中，點擊齒輪圖示，類型選擇「**網路應用程式**」。
    - **說明**：可以填寫「金流訂單管理 API」。
    - **執行身分**：選擇「**我 (您的 Email)**」。
    - **誰可以存取**：**務必選擇「任何人」**。這非常重要，因為 Payuni 的伺服器和您的後端需要能夠匿名地呼叫這個網址。
    - 點擊「部署」。

3.  **複製部署網址**：
    - 部署成功後，畫面會顯示一個「網路應用程式」的 **URL**。
    - **請完整複製這個 URL**，這就是我們需要的 Webhook 網址。

---

## Part 4: Webhook API 功能解析

您的後端專案透過呼叫這個 Webhook URL，並在後面附加 `?action=` 參數來執行不同的操作。所有請求都使用 `POST` 方法。

### `action=createOrder`
- **用途**：建立一筆新的「待支付」訂單紀錄。
- **觸發時機**：後端 `/create-payment` API 在準備向 Payuni 發起請求前。
- **POST 資料範例**：
  ```json
  {
    "tradeNo": "test1678886400",
    "merID": "YOUR_MERCHANT_ID",
    "tradeAmt": 100,
    "email": "user@example.com",
    "productID": "prod_001",
    "productName": "範例商品"
  }
  ```

### `action=updateOrder`
- **用途**：更新一筆訂單的最終狀態 (例如「已完成」)。
- **觸發時機**：後端 `/payuni-webhook` API 在接收並驗證 Payuni 的伺服器通知後。
- **POST 資料範例**：
  ```json
  {
    "MerTradeNo": "test1678886400",
    "TradeSeq": "P2023031500001",
    "Status": "已完成",
    "rawData": { ... } // 完整的 Payuni 通知內容
  }
  ```

### `action=findOrder`
- **用途**：在建立新訂單前，查找是否已存在相同使用者對相同商品的「待支付」訂單，以實現訂單複用。
- **觸發時機**：後端 `/create-payment` API 在建立新訂單號碼之前。
- **POST 資料範例**：
  ```json
  {
    "email": "user@example.com",
    "productID": "prod_001"
  }
  ```

### `action=getMyOrders` (v2 新增)
- **用途**：查詢特定 Email 的所有歷史訂單紀錄。
- **觸發時機**：後端 `/api/my-orders` API 在接收到已登入使用者的請求後。
- **POST 資料範例**：
  ```json
  {
    "email": "user@example.com"
  }
  ```
- **回傳**：一個包含該使用者所有訂單陣列的 JSON 物件。

---

## Part 5: 整合至後端專案

回到我們的 Node.js 專案，將剛剛複製的網址設定好。

1.  打開專案根目錄的 `.env` 檔案。
2.  找到 `GAS_WEBHOOK_URL` 這個變數。
3.  將您在 Part 3-3 複製的部署網址，貼到等號後面。
    ```env
    GAS_WEBHOOK_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
    ```
4.  儲存 `.env` 檔案，並**重新啟動您的 Node.js 伺服器**，以確保新的環境變數生效。
