# 統一金流 (Payuni) 測試專案

這是一個用於測試統一金流 API 整合的簡單專案，包含後端伺服器和前端支付介面。

## 功能特色

- 建立信用卡支付訂單
- AES-256-GCM 加密交易資料
- SHA256 雜湊驗證
- 支付結果通知接收

## 環境需求

- Node.js 14 或以上版本
- Payuni 商店帳號（測試環境）

## 安裝步驟

1. 安裝相依套件：

```bash
npm install
```

2. 建立 `.env` 檔案並設定以下環境變數：

```env
PAYUNI_API_URL=https://sandbox-api.payuni.com.tw/api/trade
PAYUNI_MERCHANT_ID=your_merchant_id
PAYUNI_HASH_KEY=your_hash_key
PAYUNI_HASH_IV=your_hash_iv
```

## 啟動方式

```bash
npm start
```

伺服器將在 `http://localhost` 啟動。

## 使用說明

1. 開啟瀏覽器訪問 `http://localhost`
2. 點擊「Pay with Credit Card」按鈕
3. 系統會自動導向統一金流付款頁面
4. 完成付款

## API 端點

- `POST /create-payment` - 建立支付訂單

## 技術堆疊

- Express.js - 後端框架
- Axios - HTTP 請求
- Crypto - 加密處理
- CORS - 跨域請求支援

## 注意事項

- 此為測試環境專案，請勿用於正式環境
- 請妥善保管 `.env` 檔案中的金鑰資訊
- 交易金額固定為 100 元（測試用途）
