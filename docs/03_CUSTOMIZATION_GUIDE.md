# 客製化指南 (Customization Guide)

恭喜您已經準備好將這套系統變成您自己的樣子！本指南將提供清晰、可操作的步驟，引導您完成最常見的客製化任務，讓您的網站符合您的品牌形象與業務需求。

在開始之前，強烈建議您使用 `Git` 之類的版控工具來管理您的修改，這能讓您在出錯時輕鬆地回到上一個版本。

---

## 1. 新增、修改或刪除商品

這是最常見的需求。我們將商品資料集中管理，讓修改變得非常簡單。

- **目標檔案**: `data/products.js`

這個檔案包含一個 `products` 陣列，陣列中的每一個物件都代表一項商品。

```javascript
// data/products.js 檔案結構範例
const products = [
  {
    id: 'prod_001', // 唯一的商品 ID
    name: '金流整合實戰包', // 商品名稱
    price: 1200, // 商品價格
    image: 'https://via.placeholder.com/150' // 商品圖片路徑
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
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;700&display=swap');

    body {
      font-family: 'Noto Sans TC', sans-serif; /* 將 'Noto Sans TC' 替換為您選擇的字體 */
      /* ... 其他樣式 */
    }
    ```
5.  儲存並刷新瀏覽器。

---

## 3. 修改網頁文案

網站上的標題、說明文字、按鈕文字等，都直接存放在 HTML 檔案中。

- **目標檔案**: `index.html`, `result.html`

**操作步驟**:
1.  用您的編輯器打開 `index.html` 或 `result.html`。
2.  使用編輯器的搜尋功能 (Ctrl+F / Cmd+F) 找到您想修改的文字。
3.  直接替換成您想要的內容。
4.  儲存檔案並刷新瀏覽器即可。（修改 HTML 不需要重啟伺服器）

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
      orderId: '...',
      productName: product.name,
      productDescription: product.description, // 將描述傳過去
      price: product.price
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
      e.parameter.price
    ]);
    ```

這個進階範例展示了系統的靈活性。您可以依照同樣的模式，新增任何您需要的屬性。