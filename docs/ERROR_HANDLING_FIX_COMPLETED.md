# 錯誤處理統一 - 修復完成報告

**完成日期**: 2025-12-04
**狀態**: ✅ **完成**

---

## 📋 修復內容

### 問題
業務層（services/business/）的錯誤處理不統一：
- ❌ `order-service.js` - 拋異常
- ❌ `webhook-processor.js` 的 `_grantEntitlements()` - 只 log + return

### 解決方案
統一改為：**業務層總是拋異常，由上層捕捉處理**

---

## ✅ 修復清單

### webhook-processor.js

#### 修復內容
- 第 21 行：新增 `import { PaymentErrors }`
- 第 342-345 行：將 `return;` 改為 `throw PaymentErrors.NotFound()`
- 第 351-353 行：將 `return;` 改為 `throw PaymentErrors.NotFound()`
- 第 359-361 行：將 `return;` 改為 `throw PaymentErrors.NotFound()`

#### 修復前 ❌
```javascript
if (!order) {
  logger.warn("無法授予權益：找不到訂單");
  return;  // 調用者無法知道出錯了
}
```

#### 修復後 ✅
```javascript
if (!order) {
  throw PaymentErrors.NotFound('找不到訂單', {
    tradeNo: searchTradeNo,
    originalTradeNo: tradeNo,
  });
}
```

---

## 📊 驗證結果

### 語法檢查
```
✓ src/services/business/webhook-processor.js - 通過
✓ src/services/business/order-service.js - 通過
```

### 錯誤處理統計

| 檔案 | throw 語句數 | 狀態 |
|------|-----------|------|
| order-service.js | 10 | ✅ 一致 |
| webhook-processor.js | 5 | ✅ 一致 |
| **合計** | **15** | **✅ 統一** |

### 「只 return」檢查
```bash
grep "return;" webhook-processor.js | grep -v "return {" | grep -v "return await"
結果：無
```
✅ 業務層已無「只 return」的情況

---

## 🔄 錯誤流向驗證

### 完整流程

```
業務層：_grantEntitlements()
  ├─ if (!order) → throw PaymentErrors.NotFound()  ✅
  ├─ if (!product) → throw PaymentErrors.NotFound()  ✅
  └─ if (!user) → throw PaymentErrors.NotFound()  ✅
      ↓
協調層：_grantEntitlementsWithRetry()
  └─ try-catch
      ├─ catch → 記錄、重試 ✅
      └─ 次數超限 → 記錄補償任務 ✅
```

---

## 💡 改進優勢

| 改進項 | 效果 |
|-------|------|
| **錯誤可預測** | 調用業務層總能知道是否成功 |
| **重試邏輯靠譜** | 通過異常的 `isRetryable` 判斷 |
| **堆棧追蹤完整** | 錯誤鏈清晰，易於調試 |
| **測試更容易** | 可以 mock 異常進行測試 |
| **上層靈活** | 協調層可自行決定重試策略 |

---

## 📝 最佳實踐確立

### 業務層（services/business/）

✅ **總是拋異常**

```javascript
async createOrder(orderData) {
  if (!orderData) {
    throw PaymentErrors.BadRequest('訂單資料缺失');
  }

  try {
    return await this.db.createOrder(orderData);
  } catch (error) {
    throw PaymentErrors.DatabaseUpdateFailed({...});
  }
}
```

### 協調層（services/orchestration/）

✅ **捕捉異常、決定重試**

```javascript
async processWebhook(webhookData) {
  try {
    return await this.processor.processPayment(parsedData, queryData);
  } catch (error) {
    if (error.isRetryable) {
      // 重試邏輯
    }
    return { success: false, isRetryable: error.isRetryable };
  }
}
```

### 路由層（routes/）

✅ **返回 HTTP 回應**

```javascript
router.post('/create-payment', async (req, res, next) => {
  try {
    const order = await createOrder(orderData);
    return res.json({ success: true, data: order });
  } catch (error) {
    next(error);  // 交給全局錯誤處理
  }
});
```

---

## 🎯 下一步

- [ ] 實施其他缺點修復：
  1. Entitlement 邏輯抽離
  2. 完整的支付流程測試
  3. ECPay Gateway 驗證

- [ ] 建立單元測試驗證錯誤流向

---

## 📚 相關文檔

- `ERROR_HANDLING_STRATEGY.md` - 完整的統一策略說明
- `ARCHITECTURE_RESPONSIBILITIES.md` - 各層職責定義
- 各檔案中的 JSDoc `@throws` 標記

---

**結論**：業務層錯誤處理已完全統一，現在可安心依賴異常機制進行上層協調。

