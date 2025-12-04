# 安全檢查清單（Security Checklist）

> **這份文件的目的**：在正式上線前，透過系統化的檢查清單，確保你的系統具備基本的安全防護，避免常見的資安漏洞。

---

## ⚠️ 重要聲明

**這份清單不是「完美安全」的保證**，而是幫助你：
- ✅ 避免 80% 的常見錯誤
- ✅ 建立基本的安全意識
- ✅ 知道哪些地方需要特別注意

**真實商業環境還需要**：
- 專業的滲透測試（Penetration Testing）
- 定期的安全稽核（Security Audit）
- 持續的漏洞監控（Vulnerability Monitoring）

---

## 🎯 使用這份清單的方法

### 三階段檢查策略

1. **開發階段**：邊寫邊檢查，養成安全習慣
2. **測試階段**：部署到測試環境後，完整跑一遍清單
3. **上線前**：最後一次完整檢查，確認無遺漏

### 檢查方式

每個項目標示為：
- ✅ **已完成**：確認無問題
- ⚠️ **需注意**：有潛在風險，已記錄
- ❌ **未處理**：必須修正才能上線

---

## ⚡ 快速掃描（核心 10 項）

| # | 要點 | 立即檢查 | 詳細段落 |
|---|------|-----------|-----------|
| 1 | `.env` 不入版控 | `git status` 是否出現 `.env` | [Part 1：環境變數](#part-1) |
| 2 | Session Cookie 安全 | `httpOnly` / `secure` / `sameSite` | [Part 2：認證與授權](#part-2) |
| 3 | CSRF Token 已啟用 | 表單有 `_csrf` / Header 帶 Token | [Part 3：CSRF 防護](#part-3) |
| 4 | 輸入驗證與跳脫 | 後端是否檢查型別、長度 | [Part 4：資料驗證](#part-4) |
| 5 | Helmet + CORS 設定 | 是否啟用 `helmet()`、限制來源 | [Part 5：HTTP 標頭](#part-5) |
| 6 | 敏感資料加密 | 有使用 `crypto`、bcrypt | [Part 6：敏感資料](#part-6) |
| 7 | Webhook 驗簽 | 伺服器有比對 HMAC | [Part 7：第三方 API](#part-7) |
| 8 | HTTPS / HSTS | 正式站是否強制 HTTPS | [Part 8：部署安全](#part-8) |
| 9 | 資料庫 / Sheets 權限 | 僅允許 App 伺服器與服務帳號 | [Part 9：資料庫安全](#part-9) |
|10 | 安全事件與稽核 | `logger` 是否記錄登入/異常 | [Part 10：監控與日誌](#part-10) |

> 以上 10 項跑完即可進入上線審查；若任何一項打 ❌，請優先修復再往下看完整清單。

---

## 🧠 完整檢查清單

<a id="part-1"></a>
### Part 1：環境變數與敏感資訊 🔐

#### ✅ 1.1 敏感資訊不可寫死在程式碼中

**檢查項目**：
- [ ] API Key、Secret、密碼都放在 `.env` 檔案
- [ ] `.env` 檔案已加入 `.gitignore`
- [ ] GitHub 上沒有歷史 commit 包含 `.env`
- [ ] 程式碼中沒有 hardcode 的密碼或 token

**驗證方式**：
```powershell
# 搜尋是否有寫死的 API Key（範例）
Select-String -Path .\*.js -Pattern "AIza" -Recursive
```

**常見錯誤**：
```javascript
// ❌ 錯誤：寫死在程式碼中
const apiKey = 'AIzaSyABC123...';

// ✅ 正確：從環境變數讀取
const apiKey = process.env.GOOGLE_API_KEY;
```

---

#### ✅ 1.2 環境變數的預設值安全性

**檢查項目**：
- [ ] 沒有使用危險的預設值（例如：空字串、'changeme'）
- [ ] Session secret 夠複雜（至少 32 字元）
- [ ] 加密用的 key 夠複雜（至少 32 字元）

**驗證方式**：
```javascript
// ⚠️ 危險：預設值太弱
const sessionSecret = process.env.SESSION_SECRET || 'secret';

// ✅ 安全：強制檢查
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  throw new Error('SESSION_SECRET must be at least 32 characters');
}
```

---

#### ✅ 1.3 不同環境的配置分離

**檢查項目**：
- [ ] 開發環境與正式環境使用不同的 `.env`
- [ ] 測試環境不使用正式環境的資料庫
- [ ] 正式環境的 `.env` 不存在於版本控制中

**建議做法**：
```
.env.development  （本機開發用）
.env.test         （測試環境用）
.env.production   （正式環境用，不進版控）
```

---

<a id="part-2"></a>
### Part 2：認證與授權 🔑

#### ✅ 2.1 Session 安全性設定

**檢查項目**：
- [ ] `httpOnly: true`（防止 JavaScript 讀取 Cookie）
- [ ] `secure: true`（正式環境必須 HTTPS）
- [ ] `sameSite: 'lax'` 或 `'strict'`（防 CSRF）
- [ ] Session secret 足夠複雜

**驗證方式**：
```javascript
// 檢查 startup.js 的 session 設定
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,    // ✅ 必須
    secure: process.env.NODE_ENV === 'production', // ✅ 正式環境用 HTTPS
    sameSite: 'lax',   // ✅ 防 CSRF
    maxAge: 24 * 60 * 60 * 1000 // 1 天
  }
}));
```

---

#### ✅ 2.2 Google OAuth 設定安全性

**檢查項目**：
- [ ] Redirect URI 只包含已授權的網址
- [ ] Client Secret 不在前端程式碼中
- [ ] 使用 `state` 參數防止 CSRF（Passport 預設有）

**驗證方式**：
1. 到 [Google Cloud Console](https://console.cloud.google.com/)
2. 檢查「授權重新導向 URI」只有：
   ```
   http://localhost:3000/auth/google/callback  （開發用）
   https://你的網域.com/auth/google/callback   （正式環境）
   ```
3. 確認沒有 `*` 或其他危險的萬用字元

---

#### ✅ 2.3 API 端點的權限檢查

**檢查項目**：
- [ ] 所有需要登入的 API 都有檢查 `req.isAuthenticated()`
- [ ] 使用者只能存取自己的資料（例如：訂單、訂閱）
- [ ] 沒有「忘記檢查權限」的 API

**驗證方式**：
```javascript
// ❌ 危險：沒有檢查權限
app.get('/orders', async (req, res) => {
  const orders = await getOrders(); // 所有人都能看到所有訂單！
  res.json(orders);
});

// ✅ 安全：檢查權限
app.get('/orders', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).send('請先登入');
  }
  const orders = await getOrdersByUser(req.user.email);
  res.json(orders);
});
```

---

<a id="part-3"></a>
### Part 3：CSRF 防護 🛡️

#### ✅ 3.1 CSRF Token 正確使用

**檢查項目**：
- [ ] 所有 POST/PUT/DELETE 請求都有 CSRF Token
- [ ] `csurf` middleware 正確設定
- [ ] 前端表單有包含 `_csrf` hidden input
- [ ] AJAX 請求有帶 CSRF Token

**驗證方式**：
```javascript
// 後端：確認有 csurf middleware
const csrf = require('csurf');
const csrfProtection = csrf({ cookie: true });
app.use(csrfProtection);

// 前端：表單包含 token
<form method="POST" action="/checkout">
  <input type="hidden" name="_csrf" value="<%= csrfToken %>">
  ...
</form>

// 前端：AJAX 請求包含 token
fetch('/api/orders', {
  method: 'POST',
  headers: {
    'CSRF-Token': csrfToken
  },
  body: JSON.stringify(data)
});
```

---

#### ✅ 3.2 例外路徑處理

**檢查項目**：
- [ ] Webhook 路徑（如 `/webhook/tappay`）排除 CSRF 檢查
- [ ] 排除的路徑有其他驗證機制（例如：簽名驗證）

**驗證方式**：
```javascript
// 方法 1：在 Webhook 路由前排除
app.use('/webhook', bodyParser.raw({ type: 'application/json' }));
app.post('/webhook/tappay', verifyTappaySignature, handleWebhook);

// 方法 2：使用 ignoreMethods
app.use(csrf({ 
  cookie: true,
  ignoreMethods: ['GET', 'HEAD', 'OPTIONS', 'POST'] // 小心使用！
}));
```

---

<a id="part-4"></a>
### Part 4：資料驗證與清理 🧹

#### ✅ 4.1 輸入驗證

**檢查項目**：
- [ ] 前端驗證 + 後端驗證（雙重保險）
- [ ] 驗證資料型別（字串、數字、Email 格式）
- [ ] 驗證資料範圍（金額 > 0、字串長度限制）
- [ ] 防止 SQL Injection（如果使用 SQL）

**驗證方式**：
```javascript
// ❌ 危險：沒有驗證
app.post('/checkout', (req, res) => {
  const { amount } = req.body;
  // 如果 amount 是負數或字串，就出事了
});

// ✅ 安全：完整驗證
app.post('/checkout', (req, res) => {
  const { amount } = req.body;
  
  // 檢查型別
  if (typeof amount !== 'number') {
    return res.status(400).send('金額格式錯誤');
  }
  
  // 檢查範圍
  if (amount <= 0 || amount > 100000) {
    return res.status(400).send('金額必須在 1-100000 之間');
  }
  
  // ...
});
```

---

#### ✅ 4.2 防止 XSS（跨站腳本攻擊）

**檢查項目**：
- [ ] 使用 Helmet 的 `contentSecurityPolicy`
- [ ] 使用模板引擎（EJS/Pug）時，預設會跳脫 HTML
- [ ] 不要用 `innerHTML` 或 `dangerouslySetInnerHTML`
- [ ] 使用者輸入的資料要清理

**驗證方式**：
```javascript
// ❌ 危險：沒有跳脫
const userName = req.body.name;
res.send(`<h1>Welcome, ${userName}</h1>`); // 如果 name 是 <script>alert('XSS')</script>

// ✅ 安全：使用模板引擎自動跳脫
res.render('welcome', { userName }); // EJS 會自動跳脫 <%= userName %>

// ✅ 安全：手動清理（如果必須用 innerHTML）
const DOMPurify = require('isomorphic-dompurify');
const clean = DOMPurify.sanitize(dirty);
```

---

#### ✅ 4.3 防止 NoSQL Injection

**檢查項目**：
- [ ] 不要直接把使用者輸入放入查詢條件
- [ ] 使用 ORM 的參數化查詢
- [ ] 驗證物件結構

**驗證方式**：
```javascript
// ❌ 危險：直接使用使用者輸入
const user = await User.findOne({ email: req.body.email });

// ⚠️ 如果 req.body.email 是 { $ne: null }，會回傳第一個 user！

// ✅ 安全：先驗證型別
if (typeof req.body.email !== 'string') {
  return res.status(400).send('Email 格式錯誤');
}
const user = await User.findOne({ email: req.body.email });
```

---

<a id="part-5"></a>
### Part 5：HTTP 安全標頭 🛡️

#### ✅ 5.1 Helmet 設定

**檢查項目**：
- [ ] 已安裝並啟用 `helmet` 套件
- [ ] `contentSecurityPolicy` 設定正確
- [ ] `hsts` 啟用（正式環境）
- [ ] `noSniff` 啟用

**驗證方式**：
```javascript
const helmet = require('helmet');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "js.tappaysdk.com"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    }
  },
  hsts: {
    maxAge: 31536000, // 1 年
    includeSubDomains: true,
    preload: true
  }
}));
```

---

#### ✅ 5.2 CORS 設定

**檢查項目**：
- [ ] 只允許特定的來源（不要用 `*`）
- [ ] 允許的方法限制在需要的（GET, POST）
- [ ] `credentials: true` 只在需要時啟用

**驗證方式**：
```javascript
const cors = require('cors');

// ❌ 危險：允許所有來源
app.use(cors());

// ✅ 安全：限制來源
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? 'https://你的網域.com' 
    : 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST']
}));
```

---

<a id="part-6"></a>
### Part 6：敏感資料處理 🔒

#### ✅ 6.1 資料加密

**檢查項目**：
- [ ] 敏感資料（信用卡號、身分證）使用加密存儲
- [ ] 使用 AES-256-GCM 或更強的演算法
- [ ] 加密 key 存在環境變數，不在程式碼中
- [ ] 不要自己實作加密演算法（使用 `crypto` 模組）

**驗證方式**：
```javascript
const { encrypt, decrypt } = require('./utils/crypto');

// ✅ 加密敏感資料
const encryptedCardNumber = encrypt(cardNumber);
await saveToDatabase({ card: encryptedCardNumber });

// ✅ 解密時再讀取
const decryptedCardNumber = decrypt(row.card);
```

---

#### ✅ 6.2 密碼處理

**檢查項目**：
- [ ] 密碼使用 bcrypt 或 argon2 雜湊
- [ ] 不要使用 MD5 或 SHA1（已不安全）
- [ ] Salt 由演算法自動產生，不要手動管理
- [ ] 密碼雜湊後才存入資料庫

**驗證方式**：
```javascript
const bcrypt = require('bcrypt');

// ✅ 註冊時雜湊密碼
const hashedPassword = await bcrypt.hash(password, 10);
await User.create({ email, password: hashedPassword });

// ✅ 登入時驗證
const user = await User.findOne({ email });
const isValid = await bcrypt.compare(password, user.password);
```

---

#### ✅ 6.3 日誌安全

**檢查項目**：
- [ ] 日誌不包含密碼、API Key、信用卡號
- [ ] 敏感資訊脫敏（例如：`card: '4111****1111'`）
- [ ] 正式環境的日誌存放在安全的地方

**驗證方式**：
```javascript
// ❌ 危險：記錄完整資料
console.log('User login:', req.body);

// ✅ 安全：脫敏處理
console.log('User login:', {
  email: req.body.email,
  password: '***'
});

// ✅ 更安全：使用專業的 logger
const logger = require('./utils/logger');
logger.info('User login', { email: req.body.email });
```

---

<a id="part-7"></a>
### Part 7：第三方 API 安全 🔗

#### ✅ 7.1 Webhook 簽名驗證

**檢查項目**：
- [ ] 所有 Webhook 都有驗證簽名
- [ ] 使用 HMAC-SHA256 或更強的演算法
- [ ] 比對簽名時使用 `crypto.timingSafeEqual`（防 timing attack）

**驗證方式**：
```javascript
const crypto = require('crypto');

// ✅ 驗證 TapPay Webhook
function verifyTappaySignature(req, res, next) {
  const receivedSignature = req.headers['x-tappay-signature'];
  const calculatedSignature = crypto
    .createHmac('sha256', process.env.TAPPAY_PARTNER_KEY)
    .update(JSON.stringify(req.body))
    .digest('hex');
  
  // ✅ 使用 timingSafeEqual 防止 timing attack
  const receivedBuffer = Buffer.from(receivedSignature, 'hex');
  const calculatedBuffer = Buffer.from(calculatedSignature, 'hex');
  
  if (!crypto.timingSafeEqual(receivedBuffer, calculatedBuffer)) {
    return res.status(403).send('Invalid signature');
  }
  
  next();
}
```

---

#### ✅ 7.2 Google API 權限最小化

**檢查項目**：
- [ ] 服務帳號只有需要的權限（例如：試算表編輯，不要給整個 Drive 權限）
- [ ] 定期檢視 Google Cloud 的 IAM 權限
- [ ] 不使用的 API 要停用

---

<a id="part-8"></a>
### Part 8：部署環境安全 🚀

#### ✅ 8.1 HTTPS 設定

**檢查項目**：
- [ ] 正式環境必須使用 HTTPS
- [ ] 使用有效的 SSL 憑證（Let's Encrypt 或付費憑證）
- [ ] 強制 HTTP 轉 HTTPS
- [ ] HSTS 標頭啟用

**驗證方式**：
```javascript
// ✅ 強制 HTTPS（如果 reverse proxy 沒做的話）
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && !req.secure) {
    return res.redirect('https://' + req.headers.host + req.url);
  }
  next();
});
```

---

#### ✅ 8.2 錯誤訊息處理

**檢查項目**：
- [ ] 正式環境不顯示詳細的錯誤堆疊
- [ ] 錯誤訊息不洩漏系統資訊
- [ ] 使用通用的錯誤訊息給使用者

**驗證方式**：
```javascript
// ✅ 錯誤處理 middleware
app.use((err, req, res, next) => {
  // 記錄完整錯誤（內部用）
  console.error(err.stack);
  
  // 只給使用者通用訊息（不洩漏細節）
  res.status(500).send(
    process.env.NODE_ENV === 'production' 
      ? '伺服器錯誤，請稍後再試' 
      : err.message
  );
});
```

---

#### ✅ 8.3 Rate Limiting（限流）

**檢查項目**：
- [ ] API 有設定 rate limiting
- [ ] 登入 API 有額外的限流保護（防暴力破解）
- [ ] 使用 `express-rate-limit` 或類似套件

**驗證方式**：
```javascript
const rateLimit = require('express-rate-limit');

// ✅ 一般 API 限流
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分鐘
  max: 100 // 最多 100 次請求
});
app.use('/api/', apiLimiter);

// ✅ 登入 API 更嚴格的限流
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5 // 最多 5 次嘗試
});
app.post('/auth/login', loginLimiter, handleLogin);
```

---

<a id="part-9"></a>
### Part 9：資料庫安全 🗄️

#### ✅ 9.1 連線安全

**檢查項目**：
- [ ] 資料庫連線字串使用環境變數
- [ ] 正式環境使用 SSL/TLS 連線
- [ ] 資料庫不對外開放（只允許 app server 連線）

---

#### ✅ 9.2 Google Sheets 安全

**檢查項目**：
- [ ] 服務帳號權限設為「編輯者」，不是「擁有者」
- [ ] 定期檢視試算表的共用設定
- [ ] 不要把敏感資料（密碼、完整信用卡號）直接存在 Sheets

---

<a id="part-10"></a>
### Part 10：監控與日誌 📊

#### ✅ 10.1 安全事件記錄

**檢查項目**：
- [ ] 記錄登入成功/失敗
- [ ] 記錄權限檢查失敗
- [ ] 記錄異常的 API 呼叫
- [ ] 日誌包含時間戳、IP、使用者 ID

**驗證方式**：
```javascript
const logger = require('./utils/logger');

// ✅ 記錄登入嘗試
logger.info('Login attempt', {
  email: req.body.email,
  ip: req.ip,
  success: false
});

// ✅ 記錄權限檢查失敗
logger.warn('Unauthorized access attempt', {
  user: req.user?.email,
  url: req.url,
  ip: req.ip
});
```

---

#### ✅ 10.2 定期安全檢查

**檢查項目**：
- [ ] 每月檢查一次依賴套件的漏洞（`npm audit`）
- [ ] 定期更新套件版本
- [ ] 檢視 access log，找異常流量
- [ ] 定期備份資料

**驗證方式**：
```powershell
# 檢查套件漏洞
npm audit

# 自動修復（小心會更新版本）
npm audit fix

# 列出過時的套件
npm outdated
```

---

## 📝 自我審查表（上線前最後確認）

### 核心安全項目（必過）

- [ ] ✅ `.env` 不在 GitHub 上
- [ ] ✅ Session 設定 `httpOnly` 和 `secure`
- [ ] ✅ 所有 POST 請求有 CSRF 保護
- [ ] ✅ 所有需要登入的 API 有權限檢查
- [ ] ✅ 敏感資料有加密
- [ ] ✅ Webhook 有簽名驗證
- [ ] ✅ 正式環境使用 HTTPS
- [ ] ✅ Helmet 已啟用
- [ ] ✅ 錯誤訊息不洩漏系統資訊
- [ ] ✅ 沒有 hardcode 的密碼或 API Key

### 進階安全項目（建議）

- [ ] ⚠️ Rate limiting 已設定
- [ ] ⚠️ CORS 限制特定來源
- [ ] ⚠️ 日誌有記錄安全事件
- [ ] ⚠️ 定期執行 `npm audit`
- [ ] ⚠️ Google Sheets 權限最小化

---

## 🚨 常見安全錯誤排行榜

### 第 1 名：環境變數洩漏

```javascript
// ❌ 把 .env 提交到 GitHub
git add .env
git commit -m "Add env file"
```

**解法**：加入 `.gitignore`，如果不小心提交了，要重新生成所有 secret。

---

### 第 2 名：缺少權限檢查

```javascript
// ❌ 任何人都能查看所有訂單
app.get('/orders', async (req, res) => {
  const orders = await getAllOrders();
  res.json(orders);
});
```

**解法**：檢查 `req.isAuthenticated()` 和 `req.user`。

---

### 第 3 名：CSRF Token 忘記加

```html
<!-- ❌ 表單沒有 CSRF token -->
<form method="POST" action="/checkout">
  <input type="text" name="amount">
  <button>提交</button>
</form>
```

**解法**：加上 `<input type="hidden" name="_csrf" value="<%= csrfToken %>">`。

---

### 第 4 名：沒驗證 Webhook 簽名

```javascript
// ❌ 直接相信 Webhook 的資料
app.post('/webhook/tappay', (req, res) => {
  const { status, order_number } = req.body;
  updateOrder(order_number, status); // 有人可以假造 Webhook！
});
```

**解法**：先驗證簽名，再處理資料。

---

### 第 5 名：敏感資料明文存儲

```javascript
// ❌ 信用卡號直接存資料庫
await saveOrder({ card: '4111-1111-1111-1111' });
```

**解法**：加密後再存，或根本不要存完整卡號。

---

## 🎯 安全等級評估

根據你完成的項目，評估你的安全等級：

| 等級 | 完成項目 | 評價 |
|-----|---------|-----|
| **Level 1：基礎** | 核心 10 項全過 | 可以上線，但需持續改進 ✅ |
| **Level 2：良好** | 核心 10 項 + 進階 3 項 | 具備基本防護能力 🛡️ |
| **Level 3：優秀** | 核心 10 項 + 進階 5 項 | 安全意識到位 🏆 |
| **Level 4：專家** | 全部完成 + 定期稽核 | 接近商業級標準 💎 |

---

## 📚 延伸學習資源

### 推薦閱讀

- **OWASP Top 10**：[owasp.org/www-project-top-ten](https://owasp.org/www-project-top-ten/)
- **Node.js Security Checklist**：[github.com/goldbergyoni/nodebestpractices#6-security-best-practices](https://github.com/goldbergyoni/nodebestpractices#6-security-best-practices)
- **Express Security Best Practices**：[expressjs.com/en/advanced/best-practice-security.html](https://expressjs.com/en/advanced/best-practice-security.html)

### 工具推薦

- **npm audit**：檢查套件漏洞
- **Snyk**：自動化漏洞掃描
- **Lighthouse**：檢查 HTTPS、HTTP headers
- **OWASP ZAP**：開源的滲透測試工具

---

## ✅ 最後提醒

> 「安全不是一次性的任務,而是持續的過程。」

- **不要**以為通過這份清單就「絕對安全」
- **要**定期重新檢視,隨著系統演進更新安全措施
- **不要**隱瞞安全問題,發現就要立刻修正
- **要**建立安全文化,讓團隊都有安全意識

**如果你完成了核心 10 項,你已經超越 80% 的新手專案！** 🎉

**下一步**：定期執行這份清單（建議每季一次）,持續提升你的系統安全性。

---

**有安全疑慮？** 請參考 `07_TROUBLESHOOTING.md` 或聯繫我們的技術支援。

**準備上線了？** 恭喜！記得回來填 `10_SURVEY_TEMPLATE.md` 的問卷,告訴我們你的學習心得！😊
