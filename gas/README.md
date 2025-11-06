# Google Apps Script (GAS) 設定指南

## 功能概述

這個 GAS 提供以下功能：

- ✅ 在 Google Sheets 中記錄支付訂單
- ✅ 接收 Payuni 支付通知並自動更新訂單狀態
- ✅ 查詢訂單和統計訂單數據
- ✅ 作為 Web App 服務接收 webhook

## 使用步驟

### 1. 複製代碼到 Google Apps Script

1. 打開 [Google Sheets](https://sheets.google.com/)
2. 建立新試算表或打開現有試算表
3. 點擊「擴充功能」→「Apps Script」
4. 將 `code.gs` 的內容複製到編輯器
5. 保存項目

### 2. 初始化 Sheet

1. 在 Apps Script 編輯器中，選擇 `initializeSheet` 函數
2. 點擊「運行」按鈕
3. 第一次運行時會要求授權，按照提示授權
4. 完成後，你的試算表會自動建立「訂單記錄」Sheet，包含以下欄位：
   - 訂單編號
   - 商店 ID
   - 交易金額
   - 訂單狀態
   - 建立時間
   - 完成時間
   - 交易序號
   - 備註

### 3. 部署為 Web App

1. 在 Apps Script 編輯器點擊「部署」
2. 選擇「新增部署」
3. 類型選擇「網路應用程式」
4. 以身分執行：選擇你的帳號
5. 授權類型：選擇「所有人」
6. 點擊「部署」
7. 複製生成的 URL，這將作為 webhook 端點

### 4. 配置後端

在你的後端 `.env` 中添加或更新：

```env
NOTIFY_URL=https://script.google.com/macros/d/{DEPLOYMENT_ID}/usercallback?action=webhook
```

將 `{DEPLOYMENT_ID}` 替換為步驟 3 中部署得到的 ID。

或者直接在 `index.js` 中設定：

```javascript
NotifyURL: "https://script.google.com/macros/d/{YOUR_DEPLOYMENT_ID}/usercallback?action=webhook";
```

## API 說明

### 建立訂單 (Frontend → Backend)

```javascript
// 在支付時呼叫
createOrder(tradeNo, merID, tradeAmt);
```

**參數**：

- `tradeNo`: 訂單編號（必需）
- `merID`: 商店 ID（必需）
- `tradeAmt`: 交易金額（必需）

**回傳**：true/false

### 處理通知 (Payuni → GAS)

通知會自動發送到 GAS 的 webhook 端點，GAS 會：

1. 解析通知資料
2. 查找對應訂單
3. 更新訂單狀態、完成時間、交易序號
4. 回應「SUCCESS」

**期望的通知格式**：

```json
{
  "MerTradeNo": "test1234567890",
  "TradeSeq": "SEQ123456",
  "Status": "已完成",
  "TradeAmt": 100
}
```

### 查詢函數

#### 取得所有訂單

```javascript
getAllOrders();
// 回傳: [[訂單編號, 商店ID, 金額, 狀態, ...], ...]
```

#### 查詢特定訂單

```javascript
getOrderByTradeNo("test1234567890");
// 回傳: { tradeNo, merID, amount, status, createdAt, ... }
```

#### 取得訂單統計

```javascript
getOrderStats();
// 回傳: { "待支付": 5, "已完成": 10, "已失敗": 2, ... }
```

## 測試

在 Apps Script 編輯器中運行以下測試函數：

### 測試建立訂單

```javascript
testCreateOrder();
```

### 測試更新訂單

```javascript
testUpdateOrder();
```

### 測試查詢

```javascript
testQuery();
```

## 注意事項

- 第一次使用必須運行 `initializeSheet()` 初始化
- GAS 免費版有使用配額限制，如需大量使用請升級為 Google Workspace
- webhook URL 中的 `{DEPLOYMENT_ID}` 需要正確配置
- 通知資料格式需要與代碼中的欄位對應
- 建議定期備份 Sheet 數據

## 後端集成

在 `index.js` 中已經配置了 `NOTIFY_URL`，Payuni 會在支付完成時向該 URL 發送通知。

### 流程

1. 前端提交支付請求
2. 後端建立訂單並返回支付 URL
3. 用戶完成支付
4. Payuni 向 webhook 發送通知
5. GAS 收到通知並更新 Sheet

## 常見問題

**Q: 如何修改部署 URL？**
A: 在部署管理中點擊「新增部署版本」，新版本會生成新 URL

**Q: 通知沒有被接收？**
A: 檢查 `NOTIFY_URL` 是否正確，確保 webhook 已部署

**Q: Sheet 權限錯誤？**
A: 確保授權時選擇的帳號有該 Sheet 的編輯權限

**Q: 如何查看日誌？**
A: 在 Apps Script 編輯器中點擊「執行日誌」查看
