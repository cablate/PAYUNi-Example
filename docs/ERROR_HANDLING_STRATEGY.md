# 錯誤處理統一策略

**目標**：確保整個業務層的錯誤處理方式一致可預測

---

## 🎯 統一規則

### 核心原則

**業務層（services/business/）應該總是拋異常，不要 log + return**

```javascript
// ❌ 錯誤：只 log 和 return
if (!order) {
  logger.warn("找不到訂單");
  return;  // ❌ 調用者無法知道發生了錯誤
}

// ✅ 正確：拋異常
if (!order) {
  throw PaymentErrors.NotFound('找不到訂單', { tradeNo });
}
```

### 為什麼？

| 問題 | log + return | 拋異常 |
|------|-------------|--------|
| 調用者知道出錯了？ | ❌ 不知道 | ✅ 知道 |
| 能否區分正常 vs 錯誤？ | ❌ 難 | ✅ 易 |
| 上層能否捕捉並重試？ | ❌ 無法 | ✅ 可以 |
| 能否統一處理？ | ❌ 無法 | ✅ 可以 |

---

## 📋 各層職責

### 業務層（services/business/）

**職責**：驗證、判斷、拋異常

```javascript
// order-service.js / webhook-processor.js
async findExistingOrder(userEmail, productID) {
  // 驗證參數
  if (!userEmail) {
    throw PaymentErrors.BadRequest('缺少郵箱');
  }

  // 查詢
  const order = await this.db.findPendingOrder(userEmail, productID);

  // 找不到 → 拋異常
  if (!order) {
    throw PaymentErrors.NotFound('訂單不存在', { userEmail, productID });
  }

  return order;  // 只在成功時返回
}
```

### 協調層（services/orchestration/）

**職責**：捕捉異常、決定重試、委派業務

```javascript
// webhook-handler.js
async processWebhook(webhookData) {
  try {
    // 調用業務層
    const result = await this.processor.processPayment(parsedData, queryData);
    return result;
  } catch (error) {
    // 捕捉業務層拋的異常
    if (error.isRetryable) {
      // 可重試錯誤 → 重試邏輯
      logger.warn('可重試錯誤', error);
      return { success: false, isRetryable: true };
    } else {
      // 不可重試 → 直接返回失敗
      logger.error('不可重試錯誤', error);
      return { success: false, isRetryable: false };
    }
  }
}
```

### 路由層（routes/）

**職責**：捕捉異常、返回 HTTP 回應

```javascript
// payment.js
router.post('/create-payment', async (req, res, next) => {
  try {
    // 調用各層...
    const order = await createOrder(orderData);
    return res.json({ success: true, data: order });
  } catch (error) {
    // 轉交給全局錯誤處理中間件
    next(error);
  }
});
```

---

## 🔧 需要修復的地方

### 1. webhook-processor.js 的 _grantEntitlements

**當前（❌ 錯誤）**：
```javascript
async _grantEntitlements(tradeNo, isPeriod, parsedData, queryData) {
  const searchTradeNo = isPeriod ? `${tradeNo.split("_")[0]}_0` : tradeNo;

  const order = await this.db.getOrderByTradeNo(searchTradeNo);
  if (!order) {
    logger.warn("無法授予權益：找不到訂單");
    return;  // ❌ 只 return
  }

  const product = this.products.find((p) => p.id === order.productID);
  if (!product) {
    logger.warn("無法授予權益：找不到商品");
    return;  // ❌ 只 return
  }

  // ...
}
```

**應改為（✅ 正確）**：
```javascript
async _grantEntitlements(tradeNo, isPeriod, parsedData, queryData) {
  const searchTradeNo = isPeriod ? `${tradeNo.split("_")[0]}_0` : tradeNo;

  const order = await this.db.getOrderByTradeNo(searchTradeNo);
  if (!order) {
    throw PaymentErrors.NotFound('找不到訂單', {
      tradeNo: searchTradeNo
    });
  }

  const product = this.products.find((p) => p.id === order.productID);
  if (!product) {
    throw PaymentErrors.NotFound('找不到商品', {
      productId: order.productID
    });
  }

  const user = await this.db.findUserByEmail(order.email);
  if (!user) {
    throw PaymentErrors.NotFound('找不到使用者', {
      email: order.email
    });
  }

  // ...
}
```

---

## 📊 修復清單

- [ ] **webhook-processor.js**
  - [ ] `_grantEntitlements()` - 第 338、348、357 行改為拋異常
  - [ ] 檢查其他私有方法是否有同樣問題

- [ ] **order-service.js**
  - [ ] 確保所有方法都拋異常（✅ 已正確）

- [ ] **webhook-handler.js**
  - [ ] 確保正確捕捉業務層異常（✅ 已正確）

---

## ✅ 驗證方式

修復完成後，驗證方法：

```bash
# 1. 檢查是否還有 "return;" 在業務層的判斷後
grep -A1 "if (!.*)" src/services/business/*.js | grep "return;"
# 結果應為空

# 2. 檢查是否都使用了 PaymentErrors
grep -n "throw " src/services/business/*.js | wc -l
# 應該有很多 throw 語句
```

---

## 💡 好處

統一後：
- ✅ 錯誤流向清晰（業務層拋 → 協調層捕 → 路由層響應）
- ✅ 重試邏輯可靠（通過 `isRetryable` 判斷）
- ✅ 調試更容易（完整的錯誤鏈）
- ✅ 可測試性強（可 mock 錯誤情況）
