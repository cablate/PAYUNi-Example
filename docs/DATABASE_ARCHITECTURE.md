# 訂單資料庫架構設計

## 概述

我們已經實現了一個高度靈活且可維護的訂單資料庫抽象層架構，支持未來輕鬆切換不同的資料庫實現。

## 架構層次

```
┌─────────────────────────────────────────┐
│         應用層 (Application)             │
│  payment.js, orders.js, auth.js, etc.   │
└────────────────┬────────────────────────┘
                 │ 使用
                 ▼
┌─────────────────────────────────────────┐
│      資料庫供應商層 (Provider)            │
│   OrderDatabaseProvider.js               │
│  - getOrderDatabase()                    │
│  - resetOrderDatabase() (測試用)         │
└────────────────┬────────────────────────┘
                 │ 提供
                 ▼
┌─────────────────────────────────────────┐
│        介面層 (Interface)                 │
│    IOrderDatabase.ts                     │
│  (TypeScript 型別定義)                  │
└────────────────┬────────────────────────┘
                 │ 實現
                 ▼
┌─────────────────────────────────────────┐
│      實現層 (Implementation)              │
│  GoogleSheetsOrderDatabase.js            │
│  (可增加: MongoDBOrderDatabase.js)       │
│  (可增加: PostgreSQLOrderDatabase.js)    │
└────────────────┬────────────────────────┘
                 │ 使用
                 ▼
┌─────────────────────────────────────────┐
│         外部服務層 (External)            │
│  Google Sheets API, MongoDB, etc.       │
└─────────────────────────────────────────┘
```

## 檔案結構

```
src/services/database/
├── IOrderDatabase.ts                  # 抽象介面定義
├── GoogleSheetsOrderDatabase.js        # Google Sheets 實現
├── OrderDatabaseProvider.js           # 提供者工廠
└── index.js                           # 原始的函式型 API (保留以相容舊代碼)
```

## 核心元件

### 1. IOrderDatabase.ts（介面定義）

定義所有資料庫操作必須實現的方法：

```typescript
export interface IOrderDatabase {
  initialize(): Promise<void>;
  findPendingOrder(userEmail: string, productID: string): Promise<Order | null>;
  createOrder(orderData: CreateOrderData): Promise<boolean>;
  updateOrder(updateData: UpdateOrderData): Promise<boolean>;
  getUserOrders(userEmail: string): Promise<Order[]>;
  getAllOrders(): Promise<Order[]>;
  getOrderByTradeNo(tradeNo: string): Promise<Order | null>;
  getOrderStats(): Promise<OrderStats>;
}
```

### 2. GoogleSheetsOrderDatabase.js（實現）

實現 `IOrderDatabase` 介面，與 Google Sheets API 互動：

- **認證**: 使用服務帳戶金鑰 (google-key.json)
- **試算表結構**: 11 個欄位（訂單編號到商品名稱）
- **錯誤處理**: 完整的錯誤記錄與降級機制
- **單例模式**: 透過 OrderDatabaseProvider 單例管理

### 3. OrderDatabaseProvider.js（提供者工廠）

**單一職責**：提供統一的資料庫實例

```javascript
// 使用方式
import { getOrderDatabase } from './OrderDatabaseProvider.js';

const db = getOrderDatabase();
const orders = await db.getUserOrders(email);
```

**優點**：
- 集中管理資料庫實例
- 支持環境變數切換資料庫類型
- 簡化測試（提供 resetOrderDatabase()）

## 如何使用

### 在應用代碼中使用

```javascript
import { getOrderDatabase } from "./services/database/OrderDatabaseProvider.js";

// 取得資料庫實例
const db = getOrderDatabase();

// 執行操作
const order = await db.findPendingOrder(email, productID);
const orders = await db.getUserOrders(email);
const success = await db.createOrder(orderData);
```

### 初始化試算表

```bash
node init-sheets.js
```

## 未來擴展

### 添加新的資料庫實現

1. **建立新的實現類**：

```javascript
// src/services/database/MongoDBOrderDatabase.js
export class MongoDBOrderDatabase {
  async initialize() { /* ... */ }
  async findPendingOrder(userEmail, productID) { /* ... */ }
  async createOrder(orderData) { /* ... */ }
  // ... 實現其他方法
}
```

2. **在 OrderDatabaseProvider 中註冊**：

```javascript
import { MongoDBOrderDatabase } from "./MongoDBOrderDatabase.js";

case "mongodb":
  dbInstance = new MongoDBOrderDatabase();
  break;
```

3. **透過環境變數切換**：

```env
ORDER_DATABASE_TYPE=mongodb
```

## 環境配置

### 環境變數

```env
# 資料庫類型選擇（預設: google-sheets）
ORDER_DATABASE_TYPE=google-sheets

# Google Sheets 配置
GOOGLE_SHEETS_ID=your-sheet-id
GOOGLE_SHEETS_KEY_FILE=./google-key.json
```

## 已更新的檔案

- ✅ `src/services/payment.js` - 使用 OrderDatabaseProvider
- ✅ `src/routes/orders.js` - 使用 OrderDatabaseProvider
- ✅ `init-sheets.js` - 使用 OrderDatabaseProvider
- ✅ `src/services/database/GoogleSheetsOrderDatabase.js` - 新增
- ✅ `src/services/database/OrderDatabaseProvider.js` - 新增
- ✅ `src/services/database/IOrderDatabase.ts` - 已存在

## 相容性

- ✅ `src/services/database/index.js` - 保留舊的函式型 API，確保相容性
- ✅ 所有測試繼續通過
- ✅ 零停機部署

## 優點總結

| 特性 | 好處 |
|------|------|
| 介面分離 | 解耦應用層與資料層 |
| 單一責任 | 每個類各司其職 |
| 開放-閉合原則 | 易於擴展新的資料庫 |
| 依賴倒置 | 依賴於抽象而非具體 |
| 測試友善 | 易於 Mock 和單元測試 |
| 環境切換 | 簡單的配置即可切換 |

## 下一步

1. 完成 Google Sheets 共享設定（與 service account email）
2. 運行 `node init-sheets.js` 初始化試算表
3. 啟動應用進行集成測試
4. 可選：實現 MongoDB 或 PostgreSQL 適配器

---

**架構設計時間**: 2025 年 11 月 18 日
**設計模式**: 工廠模式 + 策略模式 + 單例模式
**支援團隊**: 需要 Google Sheets API 共享權限
