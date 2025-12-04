# PAYUNi 續期收款整合規劃

## 一、現況盤點

### 已完成項目
✅ **前端 UI**：已實作「訂閱會員」與「精選商品」的分頁切換  
✅ **資料模型**：商品已區分 `type: 'subscription'` 與 `type: 'one_time'`  
✅ **一次付清金流**：已串接 PAYUNi 一次性付款 API (`/api/trade`)

### 待整合功能
❌ **續期收款 API**：尚未串接 `/api/period/Page`  
❌ **週期參數設定**：缺少訂閱方案的週期性設定 (monthly/yearly)  
❌ **每期扣款通知**：缺少 Webhook 接收每期授權結果

---

## 二、技術規劃

### 2.1 資料結構調整

在 `src/data/products.js` 中，為訂閱商品增加週期性參數：

```javascript
{
  id: "plan_pro",
  type: "subscription",
  name: "專業方案",
  price: 1990,
  period: "/月",
  
  // 新增：續期收款參數
  periodConfig: {
    periodType: "month",    // week/month/year
    periodDate: "1",        // 每月1號扣款
    periodTimes: 12,        // 扣款12期（1年）
    fType: "build",         // 首期扣款：訂單建立當日
    fAmt: 1990              // 首期金額（可選）
  },
  
  features: [...]
}
```

### 2.2 後端 API 路由設計

#### **新增路由**：`POST /create-subscription`

與現有的 `/create-payment` 並存，專門處理訂閱制支付。

**判斷邏輯**：
- 前端根據 `product.type` 決定呼叫哪個 API
- `type === 'subscription'` → `/create-subscription` (續期收款)
- `type === 'one_time'` → `/create-payment` (一次付清)

#### **新增路由**：`POST /webhook/period-notify`

接收 PAYUNi 每期授權通知。

**功能**：
1. 解密 PAYUNi 回傳的 EncryptInfo
2. 驗證 HashInfo
3. 記錄每期扣款結果到資料庫
4. （選用）發送 Email 通知使用者本期扣款成功

---

## 三、實作步驟

### Step 1：擴充商品資料
- 為訂閱方案增加 `periodConfig` 欄位
- 定義週期類型（月繳/年繳）和扣款日期

### Step 2：後端實作 - 續期收款 API
建立 `src/services/PeriodPaymentService.js`，封裝續期收款邏輯：

```javascript
class PeriodPaymentService {
  async createPeriodOrder({
    merTradeNo,
    periodAmt,
    periodType,
    periodDate,
    periodTimes,
    fType,
    prodDesc,
    payerEmail,
    notifyURL,
    returnURL
  }) {
    // 1. 組裝 EncryptInfo (AES 加密)
    // 2. 組裝 HashInfo (SHA256)
    // 3. POST 到 /api/period/Page
    // 4. 返回支付頁 URL
  }
}
```

### Step 3：後端實作 - Webhook 接收
建立 `src/routes/webhook.js`：

```javascript
router.post('/period-notify', async (req, res) => {
  const { EncryptInfo, HashInfo } = req.body;
  
  // 1. 解密並驗證
  const decrypted = aesDecrypt(EncryptInfo);
  
  // 2. 記錄到資料庫
  await PeriodTransaction.create({
    periodTradeNo: decrypted.PeriodTradeNo,
    periodOrderNo: decrypted.PeriodOrderNo,
    thisPeriod: decrypted.ThisPeriod,
    totalTimes: decrypted.TotalTimes,
    authAmt: decrypted.AuthAmt,
    status: decrypted.Status,
    authTime: decrypted.AuthTime
  });
  
  // 3. 回應 PAYUNi "OK"
  res.send('OK');
});
```

### Step 4：前端邏輯調整
在 `_frontend/public/app.js` 中：

```javascript
const handlePayment = async () => {
  const product = productsData.find(p => p.id === selectedProductId);
  
  // 根據商品類型選擇 API
  const endpoint = product.type === 'subscription' 
    ? '/create-subscription' 
    : '/create-payment';
  
  const payload = {
    productID: selectedProductId,
    turnstileToken: turnstile.getResponse()
  };
  
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken 
    },
    body: JSON.stringify(payload)
  });
  
  // 處理跳轉...
};
```

### Step 5：資料庫 Schema 設計
建立 `period_transactions` 表格：

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | INT | 主鍵 |
| user_id | STRING | 使用者 ID |
| period_trade_no | STRING | 續期收款單號 |
| period_order_no | STRING | 續期訂單編號 (含期數) |
| this_period | INT | 本次期數 |
| total_times | INT | 總期數 |
| auth_amt | INT | 本期授權金額 |
| status | STRING | 授權狀態 |
| auth_time | DATETIME | 授權時間 |
| created_at | DATETIME | 建立時間 |

---

## 四、測試計畫

### 4.1 單元測試
- ✅ AES 加解密函數
- ✅ SHA256 雜湊驗證
- ✅ 續期收款參數組裝

### 4.2 整合測試
1. **首期授權測試**：
   - 建立月繳訂單，驗證首期立即扣款
   - 驗證 `FType=build` 是否當日執行
   
2. **Webhook 測試**：
   - 模擬 PAYUNi 回傳每期授權通知
   - 驗證資料是否正確寫入資料庫

3. **週期測試**（使用測試區）：
   - 建立「每週扣款」訂單，驗證下次授權日期
   - 驗證期數遞減邏輯

### 4.3 使用者流程測試
1. 登入使用者
2. 選擇「專業方案」（月繳）
3. 完成首期支付
4. 確認訂單紀錄顯示「下次扣款日期」
5. 在「我的訂單」中查看續期收款單號

---

## 五、風險與注意事項

### ⚠️ 關鍵提醒

1. **NotifyURL 必須可公開訪問**  
   - 開發階段使用 ngrok 等工具暴露本地端口
   - 正式環境必須使用 HTTPS

2. **首期扣款日期邏輯**  
   - 若 `FType=date` 且日期非當日，PAYUNi 會先執行 1 元授權綁卡
   - 建議首期使用 `build`（訂單建立當日）避免混淆

3. **Webhook 冪等性**  
   - PAYUNi 可能重複發送通知
   - 使用 `PeriodOrderNo` 作為唯一鍵，防止重複寫入

4. **取消訂閱功能**  
   - 續期收款 API 文件未提及「取消訂閱」邏輯
   - 需確認是否有對應的 API，或由商店後台手動處理

---

## 六、優先度建議

### Phase 1（MVP - 最小可行方案）
1. ✅ 資料結構擴充 (`periodConfig`)
2. ✅ 後端實作 `/create-subscription`
3. ✅ 前端邏輯區分訂閱/一次性

### Phase 2（完整閉環）
4. ✅ Webhook 接收與資料庫記錄
5. ✅ 訂單查詢頁面顯示「下次扣款日期」

### Phase 3（進階功能）
6. ⭕ Email 通知每期扣款結果
7. ⭕ 使用者自助「取消訂閱」功能（需確認 API）
8. ⭕ 管理後台：訂閱數據分析儀表板

---

## 七、總結

此規劃將現有的「一次付清」金流升級為「混合金流」（訂閱 + 單次），完整支援 SaaS 商業模式。核心重點在於：

1. **雙軌並行**：訂閱與單次購買使用不同的 API 端點
2. **資料一致性**：Webhook 確保每期扣款結果被正確記錄
3. **使用者透明**：前端清楚顯示扣款週期與下次扣款日

建議從 **Phase 1** 開始，先確保基礎流程通暢，再逐步擴充進階功能。
