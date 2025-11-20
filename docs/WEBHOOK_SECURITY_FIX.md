# Webhook 安全漏洞修正指南

**文件日期：** 2025-11-18  
**優先級：** 🔴 極高（需立即修正）  
**影響範圍：** `/payuni-webhook` 和 `/payment-return` 端點

---

## 問題概述

### 漏洞描述

系統目前的 webhook 驗證只檢查 `HashInfo` 是否相等，**但沒有驗證 webhook 的真實來源**。

攻擊者可以：
1. 從前端攔截加密的支付資訊 (`EncryptInfo` + `HashInfo`)
2. 直接 POST 到你的 `/payuni-webhook` 端點
3. 因為 `HashInfo` 已經被計算好，驗證會通過 ✅
4. 成功偽造支付完成通知，訂單被標記為已支付 ❌

### 根本原因

```javascript
// 目前的驗證邏輯（不安全）
const calculatedHash = sha256(EncryptInfo, hashKey, hashIV);
if (calculatedHash !== HashInfo) {
  return res.send("FAIL");  // ❌ 只驗證了相等性，不驗證來源
}
```

**問題：** 使用對稱加密（共享密鑰），任何知道 `hashKey` 和 `hashIV` 的人都能計算正確的 `HashInfo`。

---

## 檢測：如何判斷被攻擊

### 信號 1：異常的請求來源

在日誌中查看 webhook 的來源：
```
[ALERT] Webhook source info: {
  "ip": "115.82.xx.xx",              ← 不是 Payuni 的 IP
  "userAgent": "Mozilla/5.0",        ← 不應該來自瀏覽器！
  "origin": "https://attacker.com",  ← 惡意來源
  "timestamp": "2025-11-18T10:30:00Z"
}
```

### 信號 2：同一訂單被重複更新

```
[WARN] Order updated: tradeNo=test1234567890, status=SUCCESS
[WARN] Order updated: tradeNo=test1234567890, status=SUCCESS  ← 同一筆在短時間內更新多次
[WARN] Order updated: tradeNo=test1234567890, status=SUCCESS
```

### 信號 3：Hash 驗證成功但 GAS 更新失敗

```
[INFO] Webhook verified: tradeNo=test1234567890
[WARN] GAS failed to update order: tradeNo=test1234567890
```

如果大量 webhook 驗證成功但 GAS 更新失敗，可能表示攻擊者在測試。

### 信號 4：本地 IP 發送 webhook

```
[WARN] Webhook received from local network: ip=192.168.1.100
```

Payuni 不會從你的本地網路發送 webhook。

---

## 修正方案

### 立即修正（第一步）- 添加請求來源驗證

**修正位置：** `index.js` 的 `/payuni-webhook` 端點

**修正代碼：**

```javascript
app.post("/payuni-webhook", async (req, res) => {
  try {
    // ============================================
    // 🆕 第一層防禦：驗證請求來源
    // ============================================
    
    const requestInfo = {
      ip: req.ip,
      userAgent: req.get('user-agent') || 'unknown',
      origin: req.get('origin') || 'none',
      referer: req.get('referer') || 'none',
      timestamp: new Date().toISOString()
    };

    logger.info("Webhook received from", requestInfo);

    // 🚨 檢測 1：Webhook 不應該來自瀏覽器
    const isFromBrowser = requestInfo.userAgent.toLowerCase().includes('mozilla');
    if (isFromBrowser) {
      logger.alert("🚨 SECURITY ALERT: Webhook from browser detected!", {
        ...requestInfo,
        threatLevel: "CRITICAL"
      });
      // 暫時還是處理，但標記為可疑
      // return res.send("FAIL");  // 如果確定 Payuni 不用瀏覽器，可直接拒絕
    }

    // 🚨 檢測 2：Webhook 不應該來自本地
    const isLocalhost = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip.startsWith('192.168') || req.ip.startsWith('10.');
    if (isLocalhost && process.env.NODE_ENV === "production") {
      logger.alert("🚨 SECURITY ALERT: Webhook from localhost in production!", {
        ...requestInfo,
        threatLevel: "CRITICAL"
      });
      return res.send("FAIL");
    }

    // 🚨 檢測 3：檢查是否來自 Payuni 白名單 IP（需要 Payuni 提供）
    // 暫時跳過，因為需要 Payuni 確認 IP 範圍
    // const PAYUNI_WEBHOOK_IPS = process.env.PAYUNI_WEBHOOK_IPS?.split(',') || [];
    // if (PAYUNI_WEBHOOK_IPS.length > 0 && !PAYUNI_WEBHOOK_IPS.includes(req.ip)) {
    //   logger.alert("Webhook IP not in Payuni whitelist", { ip: req.ip, whiteList: PAYUNI_WEBHOOK_IPS });
    //   return res.send("FAIL");
    // }

    // ============================================
    // ✅ 既有驗證：Hash 驗證（保持不變）
    // ============================================

    logger.info("Received Payuni webhook notification");

    const { EncryptInfo, HashInfo, Status } = req.body;

    if (Status !== "SUCCESS") {
      logger.warn("Payment status is not SUCCESS", { status: Status });
    }

    const hashKey = process.env.PAYUNI_HASH_KEY;
    const hashIV = process.env.PAYUNI_HASH_IV;

    // 計算並驗證 Hash
    const calculatedHash = sha256(EncryptInfo, hashKey, hashIV);
    if (calculatedHash !== hashInfo) {
      logger.warn("Hash verification failed");
      return res.send("FAIL");
    }

    // 解密資料
    const merIv = Buffer.from(hashIV, "utf8");
    const decryptedData = decrypt(EncryptInfo, hashKey, merIv);
    const parsedData = querystring.parse(decryptedData);

    const tradeNo = parsedData.MerTradeNo;
    const tradeSeq = parsedData.TradeNo;
    const payStatus = parsedData.Status || "已完成";

    if (!tradeNo) {
      logger.warn("Missing MerTradeNo in webhook data");
      return res.send("FAIL");
    }

    // ============================================
    // 🆕 第二層防禦：防止重放攻擊（可選但強烈建議）
    // ============================================
    
    // 記錄已處理的 webhook（使用 Redis 或記憶體+TTL）
    // 同一個 tradeSeq 在短時間內不應該被重複處理
    const webhookKey = `webhook_${tradeSeq}`;
    if (global.processedWebhooks && global.processedWebhooks.has(webhookKey)) {
      logger.warn("🔄 REPLAY ATTACK DETECTED: Duplicate webhook for same trade", { tradeSeq });
      return res.send("FAIL");
    }
    
    // 標記此 webhook 已處理（保留 5 分鐘）
    if (!global.processedWebhooks) {
      global.processedWebhooks = new Map();
    }
    global.processedWebhooks.set(webhookKey, true);
    setTimeout(() => global.processedWebhooks.delete(webhookKey), 300000);

    logger.info("Webhook verified", { tradeNo, tradeSeq, payStatus });

    // ============================================
    // ✅ 既有邏輯：更新 GAS 和訂單（保持不變）
    // ============================================

    if (process.env.GAS_WEBHOOK_URL) {
      try {
        const updateData = {
          MerTradeNo: tradeNo,
          TradeSeq: tradeSeq,
          Status: payStatus,
          rawData: parsedData,
        };

        const gasResponse = await axios.post(`${process.env.GAS_WEBHOOK_URL}?action=updateOrder`, updateData, {
          headers: {
            Cookie: `token=${process.env.WEBHOOK_TOKEN}`,
          },
        });

        if (!gasResponse.data?.success) {
          logger.warn("GAS failed to update order", { tradeNo });
          return res.send("FAIL");
        } else {
          logger.info("Order updated in Google Sheets", { tradeNo, status: payStatus });
        }
      } catch (gasError) {
        logger.warn("Failed to update order in Google Sheets", {
          tradeNo,
          error: gasError.message,
        });
        return res.send("FAIL");
      }
    }

    logger.info("Webhook processed successfully", { tradeNo, status: payStatus });
    res.send(Status === "SUCCESS" ? "OK" : "FAIL");
  } catch (error) {
    logger.error("Webhook processing error", {
      message: error.message,
    });
    res.send("ERROR");
  }
});
```

---

### 後續修正（第二步）- 向 Payuni 確認並添加 IP 白名單

**待辦事項：** 聯絡 Payuni 取得以下資訊

```markdown
1. ❓ Payuni webhook 來自哪些 IP 地址或 IP 範圍？
   └─ 將答案加入 `.env` 的 `PAYUNI_WEBHOOK_IPS` 變數

2. ❓ Payuni 有沒有簽署 webhook 請求？是否有 `X-Payuni-Signature` header？
   └─ 如果有，需要實施額外的簽名驗證

3. ❓ Payuni 支援查詢 API 嗎？可以主動查詢交易狀態嗎？
   └─ 如果有，可實施「主動驗證」（見下方高級方案）

4. ❓ Payuni webhook 會在 header 中附加時間戳或序列號嗎？
   └─ 用於防止重放攻擊
```

**在 `.env` 中添加：**

```bash
# Payuni Webhook 安全設定
PAYUNI_WEBHOOK_IPS=61.220.xxx.xxx,61.220.yyy.yyy
PAYUNI_WEBHOOK_SIGNATURE_SECRET=your_secret_key_from_payuni
```

---

### 高級修正（第三步）- 主動向 Payuni 驗證

**推薦度：** ⭐⭐⭐⭐⭐（最安全的方案）

在 webhook 處理後，主動向 Payuni API 查詢交易狀態：

```javascript
// 在 webhook 中添加主動驗證
app.post("/payuni-webhook", async (req, res) => {
  try {
    // ... 前面的驗證代碼

    const tradeNo = parsedData.MerTradeNo;
    const tradeSeq = parsedData.TradeNo;

    // ============================================
    // 🆕 高級防禦：向 Payuni 官方 API 驗證
    // ============================================

    logger.info("Performing active verification with Payuni API", { tradeSeq });

    try {
      // 呼叫 Payuni 的查詢 API（具體參數需要查詢 Payuni 文件）
      const payuniQueryResponse = await axios.post(
        `${process.env.PAYUNI_API_URL}/Query`,  // 需要確認確切的 API 端點
        {
          MerID: process.env.PAYUNI_MERCHANT_ID,
          TradeSeq: tradeSeq,
          TimeStamp: Math.round(new Date().getTime() / 1000),
          // ... 其他必要參數
        }
      );

      // 檢查 Payuni 官方是否確認這筆交易已支付
      if (payuniQueryResponse.data.Status !== "SUCCESS") {
        logger.alert("🚨 WEBHOOK FRAUD DETECTED!", {
          message: "Webhook claims payment success but Payuni API says otherwise",
          tradeSeq,
          webhookStatus: parsedData.Status,
          apiStatus: payuniQueryResponse.data.Status,
          threatLevel: "CRITICAL"
        });
        return res.send("FAIL");
      }

      logger.info("✓ Payment verified by Payuni official API", { tradeSeq });
    } catch (verifyError) {
      logger.warn("Failed to verify with Payuni API, but webhook validation passed", { 
        tradeSeq, 
        error: verifyError.message 
      });
      // 決策：是否拒絕此 webhook？
      // 建議：如果經常失敗，可能是 Payuni 的問題，記錄但不拒絕
    }

    // ... 繼續處理訂單更新
  }
});
```

---

## 日誌監測檢查清單

### 每天檢查的日誌模式

```bash
# 1. 檢查是否有可疑的 webhook 來源
grep -E "(Mozilla|Chrome|Safari)" /var/log/app.log | grep "Webhook received"

# 2. 檢查是否有重放攻擊
grep "REPLAY ATTACK" /var/log/app.log

# 3. 檢查是否有本地 IP 發送 webhook
grep "localhost\|192.168\|10\." /var/log/app.log | grep "Webhook"

# 4. 檢查是否有 Hash 驗證失敗
grep "Hash verification failed" /var/log/app.log

# 5. 檢查是否有欺詐檢測告警
grep "🚨" /var/log/app.log
```

### 設置告警規則

```javascript
// 建議在 logger 中添加告警觸發
if (isFromBrowser) {
  // 發送緊急告警（郵件、Slack 等）
  sendAlert({
    severity: "CRITICAL",
    title: "Possible Webhook Fraud Attempt",
    details: requestInfo
  });
}
```

---

## 修正時間表

| 優先級 | 任務 | 完成期限 | 責任人 |
|------|------|--------|------|
| 🔴 極高 | 添加請求來源驗證 | **明天** | You |
| 🔴 極高 | 添加防重放機制 | **明天** | You |
| 🟠 高 | 聯絡 Payuni 取得 IP 白名單 | **本週** | You |
| 🟠 高 | 實施 IP 白名單驗證 | **本週** | You |
| 🟡 中 | 實施主動 API 驗證 | **下週** | You |

---

## 測試檢查清單

完成修正後，執行以下測試：

```bash
# ✅ 1. 正常 webhook 應該通過
curl -X POST http://localhost:80/payuni-webhook \
  -H "Content-Type: application/json" \
  -d '{"EncryptInfo":"...", "HashInfo":"...", "Status":"SUCCESS"}'
# 預期：OK

# ❌ 2. 帶 Mozilla User-Agent 的 webhook 應該被檢測（但目前仍通過）
curl -X POST http://localhost:80/payuni-webhook \
  -H "User-Agent: Mozilla/5.0" \
  -H "Content-Type: application/json" \
  -d '{"EncryptInfo":"...", "HashInfo":"...", "Status":"SUCCESS"}'
# 預期：日誌中看到 SECURITY ALERT

# ❌ 3. 相同 tradeSeq 的重複 webhook 應該被拒絕
curl -X POST http://localhost:80/payuni-webhook \
  -H "Content-Type: application/json" \
  -d '{"EncryptInfo":"...", "HashInfo":"...", "Status":"SUCCESS"}'

curl -X POST http://localhost:80/payuni-webhook \
  -H "Content-Type: application/json" \
  -d '{"EncryptInfo":"...", "HashInfo":"...", "Status":"SUCCESS"}'  # 相同的
# 預期：第二個返回 FAIL，日誌中看到 REPLAY ATTACK DETECTED

# ❌ 4. 本地 IP 的 webhook 在 production 應該被拒絕
curl -X POST http://127.0.0.1/payuni-webhook \
  -H "Content-Type: application/json" \
  -d '{"EncryptInfo":"...", "HashInfo":"...", "Status":"SUCCESS"}'
# 預期：FAIL（在 production 環境）
```

---

## 相關文檔參考

- 📄 `docs/02_SECURITY_DEEP_DIVE.md` - 5 層防禦詳解（CSRF、Session、加密等）
- 📄 `docs/01_SYSTEM_ARCHITECTURE.md` - 系統架構中的 Webhook 流程說明
- 📄 `utils/crypto.js` - 加密和簽名的實現細節

---

## 優先級說明

**為什麼要立即修正？**

這個漏洞允許攻擊者：
1. ✅ 無需真實支付就能標記訂單為已支付
2. ✅ 獲取商品而不付款
3. ✅ 對多個訂單進行批量詐欺

**修正的好處：**
1. ✅ 檢測到異常 webhook 來源
2. ✅ 防止同一 webhook 被重複利用
3. ✅ 通過日誌追蹤攻擊嘗試
4. ✅ 符合 PCI DSS 的審計日誌要求

---

## 聯絡方式與備註

如有疑問，參考：
- Payuni 官方文件：https://www.payuni.com.tw/
- 聯絡 Payuni 技術支援確認 webhook 安全細節

**最後更新：** 2025-11-18  
**下次複審：** 修正完成後一週
