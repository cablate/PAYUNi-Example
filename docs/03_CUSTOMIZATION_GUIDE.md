# 動手實踐指南 (Hands-on Learning Guide)

恭喜您已經理解了系統的設計邏輯！這一章的必要性在於，把「理解」轉化為「功能開發能力」。透過實際修改，您不只是複習概念，而是在練習把這套系統延伸成新的功能。

- 透過「擴充屬性」，練習端到端資料流設計，為未來新增產品功能做好整合準備

> 📌 **定位補述**：本指南的編排已依照 `AI_OUTPUTS/Pivoted_Payment_Gateway_Strategy.md` 的能力導向策略，新增功能或範例時請持續強調「功能開發 > 複製範本」，並說明此練習讓你在哪個能力面向進步。
- 透過「新增商品」，掌握資料如何流向 API、前端與 webhook，這些基礎就是任何功能開發的核心
- 透過「調整 CSS/文案」，學會管理靜態資源與文案，確保 UI/UX 跟產品品牌一致
- 透過「擴充屬性」，練習端到端資料流設計，為未來新增產品功能做好整合準備

> 💡 **重要提醒：** 這不只是在「改工具」，更是在「驗證你是否真正理解了架構」。每個實作練習都對應著一個重要的系統設計概念。

在開始之前，強烈建議您使用 `Git` 之類的版控工具來管理您的修改，這能讓您在出錯時輕鬆地回到上一個版本。

---

## 閱讀前提

- 建議先讀 [00_DESIGN_PHILOSOPHY.md](./00_DESIGN_PHILOSOPHY.md) 了解設計理念
- 建議先讀 [01_SYSTEM_ARCHITECTURE.md](./01_SYSTEM_ARCHITECTURE.md) 了解系統流程
- 建議先讀 [02_SECURITY_DEEP_DIVE.md](./02_SECURITY_DEEP_DIVE.md) 了解安全考量

## 本文件涵蓋

本指南聚焦於「如何修改現有的系統以符合您的需求」。從簡單的商品管理、樣式調整，到進階的功能擴充，都有涵蓋。

## 讀完後可以

- 自信地新增、修改或刪除商品
- 調整網站的外觀和品牌風格
- 理解系統的各個部分如何相互配合
- 知道進階擴充時應該修改哪些檔案

---

## 學習地圖：從體驗到擴充

| 建議順序 | 任務 | 主要概念 | 相關檔案 |
| --- | --- | --- | --- |
| ① | 新增/修改商品 | 靜態資料、伺服器啟動流程 | `data/products.js`, `index.js` |
| ② | 調整 CSS/字體 | 靜態資源、快取、品牌一致性 | `public/style.css`, `public/result.style.css` |
| ③ | 修改文案 | 內容管理、部署與快取刷新 | `index.html`, `result.html` |
| ④ | 擴充商品屬性 | 端到端資料流、API 與自動化 | `data/products.js`, `public/app.js`, `index.js`, `@gas/code.gs` |

> **使用方式**：每完成一格，回頭檢查「我理解了哪個系統元件？」並在筆記寫下一句心得。這份筆記能幫你在未來客製化或 debug 時快速定位。

### ⏱️ 一小時快速成功清單

**0–15 分鐘｜體驗現況**
- 安裝依賴並執行 `npm start`，確認首頁載入、登入與 Turnstile 驗證正常。
- 在瀏覽器完成一次 Google OAuth 登入，確認 Session UI 更新。

**15–30 分鐘｜完成一筆訂單**
- 在 `data/products.js` 新增一個測試商品，重啟伺服器。
- 以新商品建立訂單並跳轉至 Payuni 測試環境。

**30–45 分鐘｜驗證資料流**
- 觸發 Payuni 測試付款，等待 Webhook 寫入 Google Sheet。
- 在 Sheet 或 n8n/GAS log 中確認這筆訂單存在。

**45–60 分鐘｜套用第一個客製化**
- 任選本指南的任務（改色、改文案或新增欄位）完成一次。
- 把修改記錄到 Git 或筆記，並寫下「下一步想做的擴充」。

達成以上四個檢查點，就符合 Business Plan 與 Stage3 所定義的「一小時快速成功」，也為後續更深入的實作建立信心。

---

## 1. 新增、修改或刪除商品

這是最常見的需求。我們將商品資料集中管理，讓修改變得非常簡單。

- **目標檔案**: `data/products.js`

這個檔案包含一個 `products` 陣列，陣列中的每一個物件都代表一項商品。

```javascript
// data/products.js 檔案結構範例
const products = [
  {
    id: "prod_001", // 唯一的商品 ID
    name: "金流整合實戰包", // 商品名稱
    price: 1200, // 商品價格
    image: "https://via.placeholder.com/150", // 商品圖片路徑
  },
  // ... 其他商品
];
```

### 如何新增商品？

1.  複製一個現有的商品物件 `{...}`。
2.  將 `id` 修改為一個新的、不重複的字串，例如 `prod_003`。
3.  更新 `name`, `price`, `image` 的值。
4.  儲存 `products.js` 檔案。
5.  **重新啟動您的後端伺服器** (`npm start`)，新的商品就會出現在頁面上。

### 如何修改或刪除商品？

- **修改**: 直接在 `products.js` 中找到對應的商品物件，修改其 `name` 或 `price` 等屬性，儲存並重啟伺服器。
- **刪除**: 從 `products` 陣列中，將該商品的整個物件 `{...}` 刪除，儲存並重啟伺服器。

### 💭 反思提問

完成這個練習後，問問自己：

1. **為什麼新增商品需要重啟伺服器？**
   - 提示：想想 `data/products.js` 是在什麼時候被讀取的？它是「動態」還是「靜態」資源？

2. **如果這個系統要擴展到 1000 個商品，`data/products.js` 還適合嗎？**
   - 提示：考慮檔案大小、讀取效能、搜尋功能的需求。什麼時候該考慮使用資料庫？

3. **如果你想讓商品資料「即時更新」（不需重啟），應該怎麼做？**
   - 提示：想想資料庫 + API 的組合，或是定時重新讀取檔案的機制。

**這個練習教會你的核心概念：** 靜態資料 vs 動態資料、伺服器啟動時的初始化、何時該使用資料庫。

---

## 2. 調整網站外觀與風格 (CSS)

您可以輕鬆地調整網站的顏色、字體等，使其符合您的品牌視覺。

- **目標檔案**:
  - `public/style.css` (控制首頁 `index.html`)
  - `public/result.style.css` (控制結果頁 `result.html`)

### 範例：更換網站主色系

1.  打開 `public/style.css`。
2.  在檔案的最上方，您會找到 `:root` 區塊，這裡定義了全站的顏色變數。
    ```css
    :root {
      --primary-color: #007bff; /* 主要顏色 (按鈕、連結) */
      --secondary-color: #6c757d; /* 次要顏色 */
      --background-color: #f8f9fa; /* 背景色 */
      --text-color: #212529; /* 文字顏色 */
    }
    ```
3.  將 `--primary-color` 的色碼 (例如 `#007bff`) 替換為您自己的品牌色碼。
4.  儲存檔案，然後**刷新您的瀏覽器**即可看到變更。建議使用 `Ctrl+Shift+R` (或 `Cmd+Shift+R`) 強制刷新以清除快取。

### 範例：更換全站字體

1.  前往 [Google Fonts](https://fonts.google.com/) 網站，挑選您喜歡的字體 (例如 `Noto Sans TC`)。
2.  取得 `@import` 程式碼。
3.  將該 `@import` 語法貼到 `public/style.css` 的最頂端。
4.  修改 `body` 的 `font-family` 屬性：

    ```css
    /* public/style.css */
    @import url("https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;700&display=swap");

    body {
      font-family: "Noto Sans TC", sans-serif; /* 將 'Noto Sans TC' 替換為您選擇的字體 */
      /* ... 其他樣式 */
    }
    ```

5.  儲存並刷新瀏覽器。

### 💭 反思提問

完成這個練習後，問問自己：

1. **為什麼改 CSS 只需要刷新瀏覽器，不需要重啟伺服器？**
   - 提示：想想「靜態資源」是如何被瀏覽器請求和快取的。

2. **CSS 變數（如 `--primary-color`）的好處是什麼？**
   - 提示：如果沒有變數，你要在多少個地方修改顏色？維護性如何？

3. **如果你想支援「深色模式」和「淺色模式」切換，CSS 變數該怎麼應用？**
   - 提示：考慮用 `[data-theme="dark"]` 選擇器搭配不同的變數值。

**這個練習教會你的核心概念：** 靜態資源的載入機制、CSS 變數的應用、前端快取的管理。

---

## 3. 修改網頁文案

網站上的標題、說明文字、按鈕文字等，都直接存放在 HTML 檔案中。

- **目標檔案**: `index.html`, `result.html`

**操作步驟**:

1.  用您的編輯器打開 `index.html` 或 `result.html`。
2.  使用編輯器的搜尋功能 (Ctrl+F / Cmd+F) 找到您想修改的文字。
3.  直接替換成您想要的內容。
4.  儲存檔案並刷新瀏覽器即可。（修改 HTML 不需要重啟伺服器）

### 💭 反思提問

完成這個練習後，問問自己：

1. **為什麼修改 HTML 也不需要重啟伺服器？**
   - 提示：HTML 是「伺服器端模板」還是「客戶端檔案」？

2. **如果網站有 100 個頁面，每頁都有「聯絡我們」的文字，該怎麼集中管理？**
   - 提示：考慮「組件化」、「模板引擎」或「前端框架」的概念。

3. **什麼情況下文案應該放在「資料庫」而不是「HTML 檔案」？**
   - 提示：想想多語言支援、內容管理系統(CMS)、或是需要頻繁更新的內容。

**這個練習教會你的核心概念：** 靜態內容 vs 動態內容、內容管理的策略、何時該考慮模板引擎。

---

## 4. (進階) 擴充商品屬性

如果您的商品不只有價格和名稱，還需要「尺寸」、「顏色」等不同規格，您可以擴充系統來支援它。這是一個進階操作，需要修改前後端及資料庫。

**目標：為商品新增一個 `description` (描述) 屬性。**

1.  **修改資料 (`data/products.js`)**:
    在商品物件中新增 `description` 欄位。

    ```javascript
    {
      id: 'prod_001',
      name: '金流整合實戰包',
      price: 1200,
      image: '...',
      description: '一套完整的金流解決方案' // 新增的欄位
    }
    ```

2.  **修改前端 (`index.html` & `public/app.js`)**:

    - 在 `index.html` 中，找到渲染商品卡片的地方，新增一個 `<p>` 標籤來顯示描述。
    - 在 `public/app.js` 中，修改渲染商品的函式，讓它能讀取並顯示 `product.description`。

3.  **修改後端 (`index.js`)**:
    當您希望這個 `description` 能被記錄到訂單中時：

    - 在 `/api/create-order` 端點，確保您有從 `products.js` 讀取到這個屬性。
    - 在觸發 GAS Webhook 的地方，將 `description` 加入到傳送的 JSON 物件中。

    ```javascript
    // index.js (示意)
    const payloadToGas = {
      orderId: "...",
      productName: product.name,
      productDescription: product.description, // 將描述傳過去
      price: product.price,
    };
    // ... fetch(GAS_WEBHOOK_URL, ...)
    ```

4.  **修改資料庫 (`@gas/code.gs` & Google Sheet)**:
    - 在您的 Google Sheet 中，新增一個名為 `ProductDescription` 的欄位。
    - 修改 `@gas/code.gs` 中的 `doPost` 函式，讓它能接收 `productDescription` 並寫入對應的欄位。
    ```javascript
    // @gas/code.gs (示意)
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("訂單紀錄");
    sheet.appendRow([
      new Date(),
      e.parameter.orderId,
      e.parameter.productName,
      e.parameter.productDescription, // 寫入新欄位
      e.parameter.price,
    ]);
    ```

這個進階範例展示了系統的靈活性。您可以依照同樣的模式，新增任何您需要的屬性。

### 💭 反思提問

完成這個進階練習後，問問自己：

1. **為什麼新增一個欄位需要改動「前端 + 後端 + 資料庫」三個地方？**
   - 提示：想想「資料流」是如何從使用者介面流到最終儲存的。

2. **如果忘記修改其中一個環節（如只改前端沒改後端），會發生什麼？**
   - 提示：資料會在哪個環節「遺失」？如何透過 logs 或測試來發現？

3. **有沒有辦法讓這個流程「自動化」或「更簡化」？**
   - 提示：考慮 ORM（物件關係映射）、GraphQL、或是 Low-code 平台的概念。

**這個練習教會你的核心概念：** 端到端的資料流設計、系統各層的職責分工、為什麼需要「完整測試」。

---

## 重要提醒

修改不同類型的檔案需要不同的「重新載入」方式：

| 修改檔案類型                        | 需要做什麼                                        |
| ----------------------------------- | ------------------------------------------------- |
| `data/products.js`                  | 重啟後端伺服器 (`npm start`)                      |
| `index.js` (後端邏輯)               | 重啟後端伺服器 (`npm start`)                      |
| `public/style.css`, `public/app.js` | 刷新瀏覽器 (Ctrl+Shift+R 或 Cmd+Shift+R 強制刷新) |
| `index.html`, `result.html`         | 刷新瀏覽器 (Ctrl+Shift+R 或 Cmd+Shift+R 強制刷新) |
| `@gas/code.gs`                      | 在 Google Apps Script 編輯器中重新部署            |

---

## 下一步

| 如果你想...      | 推薦閱讀                                                      |
| ---------------- | ------------------------------------------------------------- |
| 部署到線上環境   | [04_DEPLOYMENT.md](./04_DEPLOYMENT.md)                        |
| 複習安全考量     | 回到 [02_SECURITY_DEEP_DIVE.md](./02_SECURITY_DEEP_DIVE.md)   |
| 了解系統整體架構 | 回到 [01_SYSTEM_ARCHITECTURE.md](./01_SYSTEM_ARCHITECTURE.md) |
| 遇到問題         | 查看 `README.md` 中的常見問題或故障排查                       |

記住：本實戰包提供的是一個穩固的基礎。您有完全的自由去擴展它，只要遵循同樣的安全原則即可。
