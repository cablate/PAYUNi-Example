# 金流流程安全分析報告

## 1. 總體評價

經過詳細的程式碼審查，您的金流處理流程設計**非常安全**，達到了商業級應用的安全標準。

特別值得讚賞的是，您實作了**「主動查詢確認機制 (Double Check)」**，這是金流串接中最高級別的安全防護措施，能有效防禦絕大多數的常見攻擊。

---

## 2. 安全機制詳細分析

### ✅ 1. 主動查詢確認機制 (Double Check) - **最關鍵的安全設計**
*   **實作位置**: `src/routes/payment.js` (Lines 161-200)
*   **分析**: 當收到 PayUNi 的 Webhook 通知時，您的程式**並未直接信任**通知中的內容來更新訂單狀態。相反，它只將通知視為一個「觸發信號」，隨即使用 SDK 主動向 PayUNi 官方 API 查詢該筆訂單的最新狀態。
*   **優點**:
    *   **防禦偽造請求**: 即使駭客破解了加密演算法並偽造了 Webhook 請求，由於您的系統會去官方 API 查證，駭客無法偽造官方 API 的回應，因此攻擊無效。
    *   **防禦重放攻擊 (Replay Attack)**: 即使駭客攔截了舊的 Webhook 請求並重新發送，系統查詢 API 後會發現訂單狀態未變或已處理，不會造成重複扣款或錯誤狀態更新。
    *   **資料一致性**: 以官方 API 的資料為準，避免了因 Webhook 傳輸過程中可能發生的資料丟失或篡改問題。

### ✅ 2. 完整的簽章驗證 (Signature Verification)
*   **實作位置**: `src/services/payment/PayuniSDK.js` (`verifyWebhookData` 方法)
*   **分析**: 所有來自 PayUNi 的通訊（Webhook 和 Return URL）都經過了嚴格的 Hash 驗證。
*   **優點**: 確保資料在傳輸過程中沒有被篡改。只有擁有正確 `HashKey` 和 `HashIV` 的發送者（即 PayUNi）才能生成合法的簽章。

### ✅ 3. 金額一致性檢查
*   **實作位置**: `src/routes/payment.js` (Lines 174-186)
*   **分析**: 在更新訂單前，系統明確比對了「Webhook 通知的金額」與「API 查詢到的金額」。
*   **優點**: 防止金額篡改攻擊（例如駭客嘗試用 1 元購買 1000 元的商品）。

### ✅ 4. 冪等性設計 (Idempotency)
*   **實作位置**: `src/routes/payment.js` (Lines 43-47) & `src/services/index.js` (`findExistingOrder`)
*   **分析**: 在建立新訂單前，系統會先檢查是否已有該用戶對該商品的「未完成訂單」。如果有，則直接回傳舊訂單資訊。
*   **優點**: 避免用戶重複點擊造成重複下單，減少資料庫垃圾資料，並提升用戶體驗。

### ✅ 5. 機器人防護 (Anti-Bot)
*   **實作位置**: `src/routes/payment.js` & `src/utils/turnstile.js`
*   **分析**: 整合了 Cloudflare Turnstile，在建立訂單前強制驗證。
*   **優點**: 防止惡意腳本批量建立垃圾訂單，消耗伺服器資源或塞爆資料庫。

### ✅ 6. 結果頁面安全防護 (One-Time Token)
*   **實作位置**: `src/routes/payment.js` (Lines 261-264)
*   **分析**: 支付完成後，系統生成一個短效期的 `One-Time Token` 將用戶重導向到結果頁面。
*   **優點**:
    *   防止用戶直接分享結果頁面網址給他人（他人無法看到訂單細節）。
    *   防止用戶透過重新整理頁面來重複觸發某些前端邏輯。

---

## 3. 潛在風險與優化建議 (Nitpicks)

雖然目前架構非常安全，但若要追求極致，還有以下細節可以加強：

### ⚠️ 1. 時序攻擊 (Timing Attack) 風險
*   **位置**: `src/services/payment/PayuniSDK.js` Line 188: `const isValid = calculatedHash === hashInfo;`
*   **分析**: 使用一般的字串比對 (`===`) 會因為比對失敗的位置不同而消耗不同的時間，理論上駭客可以透過精確測量回應時間來猜測 Hash 值（雖然在網路延遲下極難實現）。
*   **建議**: 使用 `crypto.timingSafeEqual` 進行常數時間比對。
    ```javascript
    // 優化範例
    const bufferA = Buffer.from(calculatedHash);
    const bufferB = Buffer.from(hashInfo);
    // 需確保長度相同才能比較，否則直接回傳 false
    const isValid = bufferA.length === bufferB.length && crypto.timingSafeEqual(bufferA, bufferB);
    ```

### ⚠️ 2. 日誌敏感資料脫敏
*   **位置**: `src/services/payment/PayuniSDK.js` Line 329: `logger.info("解密後的查詢結果", { resultData });`
*   **分析**: `resultData` 可能包含用戶的個人資訊（如 Email、電話等）。雖然這是後端日誌，但若日誌系統洩漏，可能導致個資外洩。
*   **建議**: 在記錄日誌前，對敏感欄位進行遮罩處理（Masking）。

### ⚠️ 3. 錯誤訊息洩漏
*   **位置**: `src/routes/payment.js` Line 55: `throw PaymentErrors.ServerError("訂單建立失敗", { tradeNo });`
*   **分析**: 需確認 `PaymentErrors` 在傳送給前端時，是否會隱藏詳細的堆疊追蹤 (Stack Trace) 或內部錯誤細節。
*   **建議**: 確保在生產環境 (`NODE_ENV=production`) 下，API 只回傳通用的錯誤訊息，不包含具體的程式碼錯誤細節。

---

## 4. 結論

**您的金流流程是安全的，可以放心上線。**

您所擔心的「訂單同步」問題，透過 **Webhook + API 主動查詢** 的雙重機制得到了完美的解決。這是一個非常穩健的架構，即使 Webhook 丟失或延遲，只要用戶再次觸發或系統有排程檢查（若有實作），資料最終都會一致。

**不需要為了安全性做任何程式碼結構的大改動。** 上述的優化建議僅屬於錦上添花，不影響核心安全性。
