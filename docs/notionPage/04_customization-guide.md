# 動手實踐：怎麼改造

> 4 個漸進式任務 + 60 分鐘快速成功 + 能力驗證

---

## 📖 這一頁是什麼

恭喜您已經理解了系統的設計邏輯！這一章的必要性在於，把「理解」轉化為「功能開發能力」。透過實際修改，您不只是複習概念，而是在練習把這套系統延伸成新的功能。

透過這些任務，您將：
- 透過「新增商品」，掌握資料如何流向 API、前端與 webhook
- 透過「調整 CSS/文案」，學會管理靜態資源與文案
- 透過「擴充屬性」，練習端到端資料流設計

**💡 重要提醒：** 這不只是在「改工具」，更是在「驗證你是否真正理解了架構」。每個實作練習都對應著一個重要的系統設計概念。

**預期耗時：** 60 分鐘（分 4 個任務，各 15-20 分）  
**你將學到：** 資料流設計、靜態資源管理、前後端協作、系統擴展性

---

## 📚 閱讀前提

- 建議先讀 `設計理念` 了解設計理念
- 建議先讀 `系統架構` 了解系統流程
- 建議先讀 `安全機制` 了解安全考量

---

## 🗺️ 學習進度地圖

在開始之前，先了解你的學習路徑：

| 建議順序 | 任務 | 主要概念 | 相關檔案 | ⏱️ 耗時 |
|--------|------|--------|--------|-------|
| ① | 新增/修改商品 | 靜態資料、伺服器啟動流程 | `data/products.js`, `index.js` | 15 分 |
| ② | 調整 CSS/字體 | 靜態資源、快取、品牌一致性 | `public/style.css`, `public/result.style.css` | 15 分 |
| ③ | 修改文案 | 內容管理、部署與快取刷新 | `index.html`, `result.html` | 10 分 |
| ④ | 擴充商品屬性 | 端到端資料流、API 與自動化 | `data/products.js`, `public/app.js`, `index.js`, `@gas/code.gs` | 20 分 |

---

## ⏱️ 一小時快速成功清單

按照以下檢查點走，確保你在時間內完成：

### ✅ 0-15 分鐘：體驗現況

- [ ] 執行 `npm install`（第一次）
- [ ] 執行 `npm start`，確認伺服器啟動
- [ ] 打開 `http://localhost`，確認首頁能載入
- [ ] 嘗試 Google 登入
- [ ] 確認 Turnstile 驗證正常

**檢查點：** 我看到了首頁，能登入，能看到商品清單

### ✅ 15-30 分鐘：完成第一筆訂單

- [ ] 在 `data/products.js` 新增一個測試商品（複製現有商品，改個 ID 和名稱）
- [ ] 重啟伺服器（`npm start`）
- [ ] 確認新商品出現在首頁
- [ ] 點擊「立即購買」，跳轉至 Payuni
- [ ] 在 Payuni 測試環境完成一筆測試付款（使用測試信用卡）

**檢查點：** 我成功建立了一筆訂單，跳轉到了 Payuni

### ✅ 30-45 分鐘：驗證資料流

- [ ] 等待 Payuni 完成交易
- [ ] 頁面跳轉回 `result.html` 並顯示成功訊息
- [ ] 前往你的 Google Sheet，查看是否新增了一筆訂單
- [ ] 檢查後端日誌（如果有），確認 Webhook 已執行

**檢查點：** 我看到了 Google Sheet 中的新訂單紀錄

### ✅ 45-60 分鐘：套用第一個客製化

選擇以下任何一個完成：
- [ ] **改色**：改 `public/style.css` 中的 `--primary-color`，刷新瀏覽器
- [ ] **改文案**：改 `index.html` 中的標題或按鈕文字，刷新瀏覽器
- [ ] **新增商品欄位**：完成「擴充商品屬性」任務

**檢查點：** 我成功改出了「自己的」網站樣式

---

## 🎯 任務 1：新增、修改或刪除商品 (15 分)

### 目標檔案

`data/products.js` - 這個檔案包含所有商品資料

### 檔案結構

```javascript
// data/products.js
const products = [
  {
    id: "prod_001",           // 唯一的商品 ID
    name: "金流整合實戰包",   // 商品名稱
    price: 1200,              // 商品價格（整數）
    image: "https://via.placeholder.com/150", // 商品圖片 URL
  },
  {
    id: "prod_002",
    name: "另一個商品",
    price: 2500,
    image: "https://via.placeholder.com/150",
  },
  // ... 其他商品
];

module.exports = products;
```

### 操作步驟

#### 新增商品

1. 打開 `data/products.js`
2. 找到最後一個商品物件
3. 在其後複製整個 `{ id: ..., name: ..., price: ..., image: ... }` 物件
4. 修改新物件的 `id`（必須不重複，例如 `prod_003`）
5. 修改 `name` 為你的商品名稱
6. 修改 `price` 為你的商品價格
7. 可選：修改 `image` 為你的商品圖片 URL
8. **重新啟動伺服器**：
   ```bash
   # 先按 Ctrl+C 停止現有的伺服器
   npm start
   ```
9. 重新整理瀏覽器，新商品應該出現在首頁

#### 修改商品

1. 打開 `data/products.js`
2. 找到要修改的商品物件（根據 `id` 或 `name`）
3. 直接修改其 `name`、`price` 等欄位
4. 重新啟動伺服器
5. 重新整理瀏覽器，變更應該立即顯示

#### 刪除商品

1. 打開 `data/products.js`
2. 找到要刪除的商品物件
3. **整個刪除** 該物件（包括 `{}` 括號）
4. 注意逗號：如果刪除的是最後一個商品，移除其前一個商品後面的逗號
5. 重新啟動伺服器

### 💭 反思提問

**🔰 基礎理解**（看懂流程）
- 為什麼新增商品後需要重啟伺服器，而不是自動出現？

**🌟 進階思考**（理解原理）
- `products.js` 是在什麼時候被讀取的？它是「動態」還是「靜態」資源？
- 如果你每次都需要重啟伺服器才能看到商品，長期來看有什麼問題？

**🌟🌟 應用能力**（遷移到新場景）
- 如果這個系統要擴展到 1000 個商品，`data/products.js` 還適合嗎？
- 什麼時候該考慮使用資料庫而不是 JavaScript 文件？

### 📌 核心概念

**靜態資料 vs 動態資料**
- `products.js` 是「靜態資料」：伺服器啟動時讀一次，運行中不會自動重新讀取
- 如果要「動態」更新商品，需要資料庫 + API

**伺服器啟動流程**
- `npm start` 執行 `index.js`
- `index.js` 在啟動時 `require('./data/products.js')`
- 之後的所有請求都使用這個已讀取的資料

---

## 🎨 任務 2：調整網站外觀與風格 (15 分)

### 目標檔案

- `public/style.css` - 控制首頁 `index.html` 的樣式
- `public/result.style.css` - 控制結果頁 `result.html` 的樣式

### 範例 1：更換網站主色系 (5 分)

#### 操作步驟

1. 打開 `public/style.css`
2. 在檔案最上方，找到 `:root` 區塊：
   ```css
   :root {
     --primary-color: #007bff;        /* 主要顏色（按鈕、連結等） */
     --secondary-color: #6c757d;      /* 次要顏色 */
     --background-color: #f8f9fa;     /* 背景色 */
     --text-color: #212529;           /* 文字顏色 */
   }
   ```

3. 將 `--primary-color` 的色碼（例如 `#007bff`）替換為你自己的品牌色
   - 例如：`#FF6B6B`（紅色）、`#4ECDC4`（青色）、`#95E1D3`（薄荷綠）
   - 可以從 [Color Picker](https://htmlcolorcodes.com/) 取得色碼

4. 修改其他顏色變數（可選）

5. **儲存檔案**

6. **強制刷新瀏覽器**：
   - Windows：`Ctrl+Shift+R`
   - Mac：`Cmd+Shift+R`
   - 這會清除快取，重新載入最新的 CSS

#### 預期結果

所有按鈕、連結、強調元素的顏色都會改變

---

### 範例 2：更換全站字體 (5 分)

#### 操作步驟

1. 前往 [Google Fonts](https://fonts.google.com/)

2. 搜尋你喜歡的字體（例如 `Noto Sans TC`、`Playfair Display`、`Inter`）

3. 點擊「Select this font」或「+ Select」，然後「Copy code」

4. 複製得到的 `@import` 程式碼，例如：
   ```css
   @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;700&display=swap');
   ```

5. 打開 `public/style.css`

6. 在檔案**最頂端**（在所有其他 CSS 之前）貼上這個 `@import`

7. 找到 `body` 的 CSS 規則，修改 `font-family`：
   ```css
   body {
     font-family: "Noto Sans TC", sans-serif;  /* 改成你選的字體名稱 */
     /* ... 其他樣式 */
   }
   ```

8. **儲存檔案**

9. **強制刷新瀏覽器**（`Ctrl+Shift+R` 或 `Cmd+Shift+R`）

#### 預期結果

整個網站的字體都會改變

---

### 💭 反思提問

**🔰 基礎理解**（看懂流程）
- 為什麼改 CSS 只需要刷新瀏覽器，不需要重啟伺服器？

**🌟 進階思考**（理解原理）
- CSS 變數（如 `--primary-color`）的好處是什麼？
- 如果沒有 CSS 變數，你要在多少個地方修改顏色？維護性如何？

**🌟🌟 應用能力**（遷移到新場景）
- 如果你想支援「深色模式」和「淺色模式」切換，CSS 變數該怎麼應用？
- 如何使用 `[data-theme="dark"]` 選擇器搭配不同的變數值？

### 📌 核心概念

**靜態資源的載入機制**
- CSS 檔案是「靜態資源」，由伺服器直接提供
- 瀏覽器會快取 CSS，除非你強制刷新

**CSS 變數的重要性**
- 用變數集中管理顏色、字體等，改一個地方所有地方都變
- 更容易維護、支援主題切換

---

## ✍️ 任務 3：修改網頁文案 (10 分)

### 目標檔案

- `index.html` - 首頁文案
- `result.html` - 結果頁文案

### 操作步驟

1. 用編輯器打開 `index.html`

2. 使用搜尋功能（`Ctrl+F` 或 `Cmd+F`）找到你想修改的文字

3. 直接編輯該文字

4. 儲存檔案

5. **強制刷新瀏覽器**（`Ctrl+Shift+R` 或 `Cmd+Shift+R`）

### 例子

- 改標題：找到 `<h1>......</h1>` 或 `<title>......</title>`，修改其中的文字
- 改按鈕文字：找到 `<button>......</button>`，修改其中的文字
- 改說明文字：找到 `<p>......</p>`，修改其中的文字

### 💭 反思提問

**🔰 基礎理解**（看懂流程）
- 為什麼修改 HTML 也不需要重啟伺服器？

**🌟 進階思考**（理解原理）
- HTML 是「伺服器端模板」還是「客戶端檔案」？
- 伺服器什麼時候把 HTML 發送給瀏覽器？

**🌟🌟 應用能力**（遷移到新場景）
- 如果網站有 100 個頁面，每頁都有「聯絡我們」的文字，該怎麼集中管理？
- 什麼情況下文案應該放在「資料庫」而不是「HTML 檔案」？
- 考慮「多語言支援」時，怎麼設計？

### 📌 核心概念

**靜態內容 vs 動態內容**
- HTML 是「靜態內容」：每次訪問都一樣
- 如果要根據使用者不同而顯示不同內容，需要「動態」網頁（模板引擎、前端框架等）

**內容管理策略**
- 簡單文案：直接在 HTML 中
- 經常改的文案：考慮資料庫或 CMS
- 多語言文案：用 i18n（國際化）庫

---

## 🚀 任務 4（進階）：擴充商品屬性 (20 分)

### 目標

為商品新增一個 `description`（描述）屬性，讓它在前端顯示、在下訂單時記錄、最後寫入 Google Sheet。

**這個任務展示了端到端的資料流設計。**

### 第一步：修改資料 (`data/products.js`)

打開 `data/products.js`，在每個商品物件中新增 `description` 欄位：

```javascript
{
  id: 'prod_001',
  name: '金流整合實戰包',
  price: 1200,
  image: '...',
  description: '一套完整的金流解決方案，包含設計理念、系統架構和實戰指南' // 新增
}
```

**重啟伺服器** (`npm start`)

---

### 第二步：修改前端 (`index.html` & `public/app.js`)

#### 修改 `index.html`

找到渲染商品卡片的地方，新增一行來顯示描述：

```html
<!-- 在商品名稱下方新增 -->
<p class="product-description">一套完整的金流解決方案，包含設計理念、系統架構和實戰指南</p>
```

#### 修改 `public/app.js`

找到渲染商品的函式（通常是 `renderProducts()` 或類似名稱），新增邏輯來動態顯示描述：

```javascript
// 大約在建立商品卡片的地方
const productCard = `
  <div class="product">
    <h3>${product.name}</h3>
    <p class="description">${product.description}</p> <!-- 新增這行 -->
    <p>NT$${product.price}</p>
    <button onclick="createOrder('${product.id}')">立即購買</button>
  </div>
`;
```

**強制刷新瀏覽器** (`Ctrl+Shift+R` 或 `Cmd+Shift+R`)

你應該看到每個商品下方都顯示了描述。

---

### 第三步：修改後端 (`index.js`)

當下訂單時，確保後端有讀取到 `description` 並把它包含在要傳送給 GAS 的資料中。

在 `/api/create-order` 端點中，找到這一段：

```javascript
// 大約在查詢商品資料後
const product = products.find(p => p.id === productId);

// 新增：確保 description 被包含
const payloadToGas = {
  orderId: "...",
  productName: product.name,
  productDescription: product.description, // 新增這行
  price: product.price,
  // ... 其他欄位
};
```

**重啟伺服器** (`npm start`)

---

### 第四步：修改資料庫 (`@gas/code.gs` & Google Sheet)

#### 修改 Google Sheet

1. 打開你的 Google Sheet
2. 在表頭新增一個欄位名稱：`ProductDescription`（或其他你喜歡的名稱）

#### 修改 `@gas/code.gs`

打開 Google Apps Script 編輯器，找到 `doPost` 函式。

在 `sheet.appendRow(...)` 的陣列中，新增欄位來接收描述：

```javascript
// 大約在 doPost 函式中
sheet.appendRow([
  new Date(),
  e.parameter.orderId,
  e.parameter.productName,
  e.parameter.productDescription, // 新增這行
  e.parameter.price,
  // ... 其他欄位
]);
```

**在 Google Apps Script 編輯器中重新部署**（部署 → 新增部署）

---

### 驗證：完成一筆新訂單

1. 在 `data/products.js` 新增描述
2. 重啟伺服器
3. 打開首頁，確認描述顯示
4. 完成一筆訂單
5. 檢查 Google Sheet，新訂單的「ProductDescription」欄位應該有值

---

### 💭 反思提問

**🔰 基礎理解**（看懂流程）
- 為什麼新增一個欄位需要改動「前端 + 後端 + 資料庫」三個地方？

**🌟 進階思考**（理解原理）
- 資料流是如何從使用者介面流到最終儲存的？
- 如果忘記修改其中一個環節（如只改前端沒改後端），會發生什麼？資料會在哪個環節「遺失」？

**🌟🌟 應用能力**（遷移到新場景）
- 有沒有辦法讓這個流程「自動化」或「更簡化」？
- 考慮 ORM（物件關係映射）或 GraphQL 的概念，它們如何簡化這個過程？

### 📌 核心概念

**端到端的資料流設計**
- 資料從使用者介面 → 前端 → 後端 → 資料庫
- 每一層都要確保資料正確傳遞

**系統各層的職責分工**
- 前端：呈現、收集輸入
- 後端：驗證、加密、組織資料
- 資料庫：儲存

**為什麼需要「完整測試」**
- 修改一個地方後，要確認整個流程都還能正常運作

---

## 📋 重要提醒：修改檔案的方式

不同類型的檔案需要不同的「重新載入」方式：

| 修改檔案類型 | 需要做什麼 |
|-----------|---------|
| `data/products.js` | 重啟後端伺服器（`npm start`） |
| `index.js` 等後端邏輯 | 重啟後端伺服器（`npm start`） |
| `public/style.css` | 強制刷新瀏覽器（`Ctrl+Shift+R` 或 `Cmd+Shift+R`） |
| `public/app.js` 等前端邏輯 | 強制刷新瀏覽器 |
| `index.html`, `result.html` | 強制刷新瀏覽器 |
| `@gas/code.gs` | 在 Google Apps Script 編輯器中重新部署 |

---

## ✅ 一小時成功驗證清單

完成所有任務後，檢查以下項目：

### 第 15 分鐘檢查點
- [ ] `npm start` 成功啟動
- [ ] 打開 `http://localhost`，首頁能載入
- [ ] Google 登入正常
- [ ] Turnstile 驗證正常

### 第 30 分鐘檢查點
- [ ] 在 `data/products.js` 新增了一個測試商品
- [ ] 重啟伺服器後，新商品出現在首頁
- [ ] 能點擊「立即購買」
- [ ] 成功跳轉至 Payuni 測試環境

### 第 45 分鐘檢查點
- [ ] 在 Payuni 完成測試付款
- [ ] 頁面跳轉回 `result.html` 並顯示成功訊息
- [ ] 前往 Google Sheet，確認有新訂單紀錄
- [ ] 日誌顯示 Webhook 已執行

### 第 60 分鐘檢查點
- [ ] 修改了至少一個客製化（改色、改文案、擴充屬性等）
- [ ] 修改已套用並在瀏覽器中看到效果
- [ ] 理解了這個修改如何影響整個系統

---

## 🎉 你做到了！

如果上面所有項目都打勾，恭喜！你已經完成了「一小時快速成功」，並掌握了這套系統的核心能力。

**下一步怎麼走？**
- 想部署到線上？查看內部文件 `04_DEPLOYMENT.md`
- 想深化某個方面？回到 `系統架構` 或 `安全機制` 複習
- 想做更複雜的擴充？試著參考「任務 4」的模式，新增其他欄位

---

## 📚 下一步

| 如果你想... | 推薦閱讀 |
|-----------|--------|
| **部署到線上環境** | 內部文件 `04_DEPLOYMENT.md` |
| **複習安全考量** | 回到 `安全機制` |
| **了解系統整體** | 回到 `系統架構` |
| **遇到問題排查** | 內部文件 `07_TROUBLESHOOTING.md` |

---

*定位補述：本指南的編排已依照策略文件的能力導向策略，新增功能或範例時請持續強調「功能開發 > 複製範本」，並說明此練習讓你在哪個能力面向進步。*
