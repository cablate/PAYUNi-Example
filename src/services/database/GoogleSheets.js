import fs from "fs";
import { google } from "googleapis";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import logger from "../../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ========================================
// Google Sheets 認證與初始化
// ========================================

/**
 * 從金鑰文件創建 JWT 認證
 */
function getAuthClient() {
  const keyFile = process.env.GOOGLE_SHEETS_KEY_FILE || path.join(__dirname, "../../../google-key.json");

  if (!fs.existsSync(keyFile)) {
    throw new Error(`Google Sheets 認證金鑰文件未找到: ${keyFile}`);
  }

  try {
    const keyData = JSON.parse(fs.readFileSync(keyFile, "utf8"));

    // 驗證是否為正確的服務帳戶 JSON
    if (!keyData.client_email || !keyData.private_key) {
      throw new Error(
        `金鑰文件格式不正確。需要服務帳戶 JSON，但收到的是 "${keyData.type || keyData.web ? "OAuth" : "Unknown"}" 類型。` +
        `\n\n請確認您使用的是 Google Cloud 服務帳戶金鑰，而不是 OAuth 應用認證。`
      );
    }

    const auth = new google.auth.GoogleAuth({
      credentials: keyData,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    return auth;
  } catch (error) {
    logger.error("Google Sheets 認證失敗", { error: error.message });
    throw error;
  }
}

/**
 * 取得 Sheets API 客戶端
 */
function getSheetsClient() {
  const auth = getAuthClient();
  return google.sheets({ version: "v4", auth });
}

// ========================================
// 試算表結構與欄位索引
// ========================================

const SHEET_NAME = "訂單記錄";
const HEADERS = [
  "訂單編號",      // A (0)
  "商店ID",        // B (1)
  "交易金額",      // C (2)
  "訂單狀態",      // D (3)
  "Email",         // E (4)
  "建立時間",      // F (5)
  "完成時間",      // G (6)
  "交易序號",      // H (7)
  "備註",          // I (8)
  "商品ID",        // J (9)
  "商品名稱",      // K (10)
  "續期收款單號",  // L (11) PeriodTradeNo
  "支付方式",      // M (12)
  "退款金額",      // N (13)
  "取消時間",      // O (14)
];

const COLUMN_INDICES = {
  tradeNo: 0,         // A - 訂單編號
  merID: 1,           // B - 商店ID
  tradeAmt: 2,        // C - 交易金額
  status: 3,          // D - 訂單狀態
  email: 4,           // E - Email
  createdAt: 5,       // F - 建立時間
  completedAt: 6,     // G - 完成時間
  tradeSeq: 7,        // H - 交易序號
  remark: 8,          // I - 備註
  productID: 9,       // J - 商品ID
  productName: 10,    // K - 商品名稱
  periodTradeNo: 11,  // L - 續期收款單號
  paymentMethod: 12,  // M - 支付方式
  refundAmount: 13,   // N - 退款金額
  cancelledAt: 14,    // O - 取消時間
};

// ========================================
// Users Sheet
// ========================================
const SHEET_USERS = "使用者資料";
const HEADERS_USERS = [
  "GoogleID",      // A (0)
  "Email",         // B (1)
  "姓名",          // C (2)
  "頭像",          // D (3)
  "建立時間",      // E (4)
  "最後登入",      // F (5)
];

const COLUMN_INDICES_USERS = {
  googleId: 0,
  email: 1,
  name: 2,
  picture: 3,
  createdAt: 4,
  lastLogin: 5,
};

// ========================================
// Entitlements Sheet
// ========================================
const SHEET_ENTITLEMENTS = "權益紀錄";
const HEADERS_ENTITLEMENTS = [
  "權益ID",        // A (0)
  "使用者ID",      // B (1) (GoogleID)
  "商品ID",        // C (2)
  "類型",          // D (3) (one_time, subscription)
  "狀態",          // E (4) (active, expired, cancelled)
  "開始日期",      // F (5)
  "到期日期",      // G (6) (for subscription)
  "來源訂單",      // H (7)
  "續期收款單號",  // I (8) PeriodTradeNo
  "自動續約",      // J (9) AutoRenew (true/false)
  "取消時間",      // K (10) CancelledAt
  "上次續費日",    // L (11) LastRenewalDate
  "下次扣款日",    // M (12) NextBillingDate
];

const COLUMN_INDICES_ENTITLEMENTS = {
  entitlementId: 0,
  userId: 1,
  productId: 2,
  type: 3,
  status: 4,
  startDate: 5,
  expiryDate: 6,
  sourceOrderId: 7,
  periodTradeNo: 8,      // I - 續期收款單號
  autoRenew: 9,          // J - 自動續約
  cancelledAt: 10,       // K - 取消時間
  lastRenewalDate: 11,   // L - 上次續費日
  nextBillingDate: 12,   // M - 下次扣款日
};

// ========================================
// Period Payments Sheet (訂閱扣款記錄)
// ========================================
const SHEET_PERIOD_PAYMENTS = "訂閱扣款記錄";
const HEADERS_PERIOD_PAYMENTS = [
  "扣款ID",          // A (0)
  "續期收款單號",    // B (1) PeriodTradeNo
  "原始訂單號",      // C (2) 對應 Orders 表的 _0 訂單
  "期數",           // D (3) 1, 2, 3...
  "交易序號",        // E (4) PayUNi TradeNo
  "金額",           // F (5)
  "狀態",           // G (6)
  "扣款時間",        // H (7)
  "備註",           // I (8)
];

const COLUMN_INDICES_PERIOD_PAYMENTS = {
  paymentId: 0,
  periodTradeNo: 1,
  baseOrderNo: 2,
  sequenceNo: 3,
  tradeSeq: 4,
  amount: 5,
  status: 6,
  paymentTime: 7,
  remark: 8,
};

// ========================================
// Google Sheets 實現
// ========================================

/**
 * Google Sheets 訂單資料庫服務實現
 * 實現 IOrderDatabase 介面
 */
export class GoogleSheetsOrderDatabase {
  /**
   * 初始化試算表（建立標題欄位）
   */
  async initialize() {
    const sheets = getSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

    if (!spreadsheetId) {
      throw new Error("缺少 GOOGLE_SHEETS_ID 環境變數");
    }

    try {
      // 檢查工作表是否存在
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
      const existingSheet = spreadsheet.data.sheets?.find((s) => s.properties.title === SHEET_NAME);

      if (!existingSheet) {
        // 建立新工作表
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                addSheet: {
                  properties: {
                    title: SHEET_NAME,
                  },
                },
              },
            ],
          },
        });
        logger.info(`建立新工作表: ${SHEET_NAME}`);
      }

      // 寫入標題欄位 (訂單記錄)
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SHEET_NAME}!A1:O1`, // 擴充到 O 欄
        valueInputOption: "RAW",
        requestBody: {
          values: [HEADERS],
        },
      });

      // 初始化 Users Sheet
      await this._initializeSheet(sheets, spreadsheetId, SHEET_USERS, HEADERS_USERS);

      // 初始化 Entitlements Sheet
      await this._initializeSheet(sheets, spreadsheetId, SHEET_ENTITLEMENTS, HEADERS_ENTITLEMENTS);

      // 初始化 Period Payments Sheet
      await this._initializeSheet(sheets, spreadsheetId, SHEET_PERIOD_PAYMENTS, HEADERS_PERIOD_PAYMENTS);

      logger.info("試算表初始化成功", { spreadsheetId, sheetName: SHEET_NAME });
      return true;
    } catch (error) {
      logger.error("試算表初始化失敗", { error: error.message });
      throw error;
    }
  }

  /**
   * 查找現有的待支付訂單
   */
  async findPendingOrder(userEmail, productID) {
    const sheets = getSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

    if (!spreadsheetId) {
      logger.warn("缺少 GOOGLE_SHEETS_ID 環境變數");
      return null;
    }

    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${SHEET_NAME}!A:O`, // 擴充到 O 欄
      });

      const rows = response.data.values || [];
      if (rows.length <= 1) {
        return null;
      }

      // 從後往前搜尋（最新的訂單優先）
      for (let i = rows.length - 1; i > 0; i--) {
        const row = rows[i];
        const email = row[COLUMN_INDICES.email];
        const productId = row[COLUMN_INDICES.productID];
        const orderStatus = row[COLUMN_INDICES.status];

        if (email === userEmail && productId === productID && orderStatus === "待支付") {
          const order = {
            tradeNo: row[COLUMN_INDICES.tradeNo],
            merID: row[COLUMN_INDICES.merID],
            tradeAmt: row[COLUMN_INDICES.tradeAmt],
            status: orderStatus,
            email,
            productID: productId,
          };
          logger.info("找到現有的待支付訂單", { tradeNo: order.tradeNo, email, productID });
          return order;
        }
      }

      return null;
    } catch (error) {
      logger.warn("查詢訂單失敗", { error: error.message });
      return null;
    }
  }

  /**
   * 建立新訂單
   */
  async createOrder(orderData) {
    const sheets = getSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

    if (!spreadsheetId) {
      logger.warn("缺少 GOOGLE_SHEETS_ID 環境變數");
      return false;
    }

    try {
      const { tradeNo, merID, tradeAmt, email, productID, productName } = orderData;
      const now = new Date().toISOString();

      const row = [
        tradeNo,           // A - 訂單編號
        merID,             // B - 商店ID
        tradeAmt,          // C - 交易金額
        "待支付",          // D - 訂單狀態
        email,             // E - Email
        now,               // F - 建立時間
        "",                // G - 完成時間
        "",                // H - 交易序號
        "",                // I - 備註
        productID,         // J - 商品ID
        productName,       // K - 商品名稱
        "",                // L - 續期收款單號 (Webhook 時填入)
        "",                // M - 支付方式 (Webhook 時填入)
        "",                // N - 退款金額
        "",                // O - 取消時間
      ];

      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${SHEET_NAME}!A:O`, // 擴充到 O 欄
        valueInputOption: "RAW",
        requestBody: {
          values: [row],
        },
      });

      logger.info("訂單建立成功", { tradeNo, email, merID, spreadsheetId });
      return true;
    } catch (error) {
      logger.warn("建立訂單失敗", { tradeNo: orderData.tradeNo, error: error.message });
      return false;
    }
  }

  /**
   * 更新訂單狀態
   */
  async updateOrder(updateData) {
    const sheets = getSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

    if (!spreadsheetId) {
      logger.warn("缺少 GOOGLE_SHEETS_ID 環境變數");
      return false;
    }

    try {
      const { MerTradeNo, TradeSeq, Status } = updateData;

      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${SHEET_NAME}!A:O`, // 擴充到 O 欄
      });

      const rows = response.data.values || [];
      let targetRowIndex = -1;

      for (let i = 1; i < rows.length; i++) {
        if (rows[i][COLUMN_INDICES.tradeNo] === MerTradeNo) {
          targetRowIndex = i;
          break;
        }
      }

      if (targetRowIndex === -1) {
        logger.warn("找不到要更新的訂單", { MerTradeNo });
        return false;
      }

      const now = new Date().toISOString();
      const rowNum = targetRowIndex + 1;
      const existingRow = rows[targetRowIndex];

      const updateRow = [
        existingRow[COLUMN_INDICES.tradeNo],
        existingRow[COLUMN_INDICES.merID],
        Number(existingRow[COLUMN_INDICES.tradeAmt]),
        Status,
        existingRow[COLUMN_INDICES.email],
        existingRow[COLUMN_INDICES.createdAt],
        now,
        TradeSeq || existingRow[COLUMN_INDICES.tradeSeq] || "",
        JSON.stringify(updateData),
        existingRow[COLUMN_INDICES.productID],
        existingRow[COLUMN_INDICES.productName],
        updateData.PeriodTradeNo || existingRow[COLUMN_INDICES.periodTradeNo] || "", // 更新 PeriodTradeNo
        updateData.PaymentMethod || existingRow[COLUMN_INDICES.paymentMethod] || "", // 支付方式
        existingRow[COLUMN_INDICES.refundAmount] || "", // 退款金額
        existingRow[COLUMN_INDICES.cancelledAt] || "",  // 取消時間
      ];

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SHEET_NAME}!A${rowNum}:O${rowNum}`, // 擴充到 O 欄
        valueInputOption: "RAW",
        requestBody: {
          values: [updateRow],
        },
      });

      logger.info("訂單更新成功", { MerTradeNo, Status, spreadsheetId });
      return true;
    } catch (error) {
      logger.warn("更新訂單失敗", { MerTradeNo: updateData.MerTradeNo, error: error.message });
      return false;
    }
  }

  /**
   * 查詢特定 Email 的所有訂單
   */
  async getUserOrders(userEmail) {
    const sheets = getSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

    if (!spreadsheetId) {
      logger.warn("缺少 GOOGLE_SHEETS_ID 環境變數");
      return [];
    }

    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${SHEET_NAME}!A:O`, // 擴充到 O 欄
      });

      const rows = response.data.values || [];
      const userOrders = [];

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const email = row[COLUMN_INDICES.email];

        if (email === userEmail) {
          userOrders.push({
            tradeNo: row[COLUMN_INDICES.tradeNo],
            tradeAmt: row[COLUMN_INDICES.tradeAmt],
            status: row[COLUMN_INDICES.status],
            createdAt: row[COLUMN_INDICES.createdAt],
            productName: row[COLUMN_INDICES.productName],
            email: email,
            tradeSeq: row[COLUMN_INDICES.tradeSeq],
            completedAt: row[COLUMN_INDICES.completedAt],
          });
        }
      }

      // 按建立時間降冪排序
      userOrders.sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateB - dateA;
      });

      logger.info("查詢使用者訂單成功", { email: userEmail, count: userOrders.length });
      return userOrders;
    } catch (error) {
      logger.warn("查詢使用者訂單失敗", { email: userEmail, error: error.message });
      return [];
    }
  }

  /**
   * 取得所有訂單
   */
  async getAllOrders() {
    const sheets = getSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

    if (!spreadsheetId) {
      logger.warn("缺少 GOOGLE_SHEETS_ID 環境變數");
      return [];
    }

    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${SHEET_NAME}!A:O`, // 擴充到 O 欄
      });

      const rows = response.data.values || [];
      const orders = [];

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        orders.push({
          tradeNo: row[COLUMN_INDICES.tradeNo],
          merID: row[COLUMN_INDICES.merID],
          tradeAmt: row[COLUMN_INDICES.tradeAmt],
          status: row[COLUMN_INDICES.status],
          email: row[COLUMN_INDICES.email],
          createdAt: row[COLUMN_INDICES.createdAt],
          completedAt: row[COLUMN_INDICES.completedAt],
          tradeSeq: row[COLUMN_INDICES.tradeSeq],
          remark: row[COLUMN_INDICES.remark],
          productID: row[COLUMN_INDICES.productID],
          productName: row[COLUMN_INDICES.productName],
        });
      }

      logger.info("取得所有訂單成功", { count: orders.length });
      return orders;
    } catch (error) {
      logger.warn("取得所有訂單失敗", { error: error.message });
      return [];
    }
  }

  /**
   * 按訂單編號查詢單筆訂單
   */
  async getOrderByTradeNo(tradeNo) {
    const sheets = getSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

    if (!spreadsheetId) {
      logger.warn("缺少 GOOGLE_SHEETS_ID 環境變數");
      return null;
    }

    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${SHEET_NAME}!A:O`, // 擴充到 O 欄
      });

      const rows = response.data.values || [];

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row[COLUMN_INDICES.tradeNo] === tradeNo) {
          return {
            tradeNo: row[COLUMN_INDICES.tradeNo],
            merID: row[COLUMN_INDICES.merID],
            tradeAmt: row[COLUMN_INDICES.tradeAmt],
            status: row[COLUMN_INDICES.status],
            email: row[COLUMN_INDICES.email],
            createdAt: row[COLUMN_INDICES.createdAt],
            completedAt: row[COLUMN_INDICES.completedAt],
            tradeSeq: row[COLUMN_INDICES.tradeSeq],
            remark: row[COLUMN_INDICES.remark],
            productID: row[COLUMN_INDICES.productID],
            productName: row[COLUMN_INDICES.productName],
            periodTradeNo: row[COLUMN_INDICES.periodTradeNo] || "", // ← 新增
          };
        }
      }

      logger.info("找不到訂單", { tradeNo });
      return null;
    } catch (error) {
      logger.warn("查詢訂單失敗", { tradeNo, error: error.message });
      return null;
    }
  }

  /**
   * 獲取訂單統計
   */
  async getOrderStats() {
    const sheets = getSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

    if (!spreadsheetId) {
      logger.warn("缺少 GOOGLE_SHEETS_ID 環境變數");
      return { 待支付: 0, 已完成: 0, 已失敗: 0, 其他: 0 };
    }

    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${SHEET_NAME}!A:O`, // 擴充到 O 欄
      });

      const rows = response.data.values || [];
      const stats = { 待支付: 0, 已完成: 0, 已失敗: 0, 其他: 0 };

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const status = row[COLUMN_INDICES.status];

        if (status in stats) {
          stats[status]++;
        } else {
          stats["其他"]++;
        }
      }

      logger.info("訂單統計成功", { stats });
      return stats;
    } catch (error) {
      logger.warn("訂單統計失敗", { error: error.message });
      return { 待支付: 0, 已完成: 0, 已失敗: 0, 其他: 0 };
    }
  }
  /**
   * 輔助方法：初始化單個工作表
   */
  async _initializeSheet(sheets, spreadsheetId, sheetName, headers) {
    try {
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
      const existingSheet = spreadsheet.data.sheets?.find((s) => s.properties.title === sheetName);

      if (!existingSheet) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                addSheet: {
                  properties: { title: sheetName },
                },
              },
            ],
          },
        });
        logger.info(`建立新工作表: ${sheetName}`);
      }

      // 更新標題
      const range = `${sheetName}!A1:${String.fromCharCode(65 + headers.length - 1)}1`;
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: "RAW",
        requestBody: { values: [headers] },
      });
    } catch (error) {
      logger.warn(`初始化工作表 ${sheetName} 失敗`, { error: error.message });
    }
  }

  // ========================================
  // 使用者管理 (Users)
  // ========================================

  /**
   * 查找使用者
   */
  async findUser(googleId) {
    const sheets = getSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${SHEET_USERS}!A:F`,
      });

      const rows = response.data.values || [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row[COLUMN_INDICES_USERS.googleId] === googleId) {
          return {
            googleId: row[COLUMN_INDICES_USERS.googleId],
            email: row[COLUMN_INDICES_USERS.email],
            name: row[COLUMN_INDICES_USERS.name],
            picture: row[COLUMN_INDICES_USERS.picture],
            createdAt: row[COLUMN_INDICES_USERS.createdAt],
            lastLogin: row[COLUMN_INDICES_USERS.lastLogin],
            rowIndex: i + 1, // 1-based index
          };
        }
      }
      return null;
    } catch (error) {
      logger.error("查找使用者失敗", { error: error.message });
      return null;
    }
  }

  /**
   * 查找使用者 (By Email)
   */
  async findUserByEmail(email) {
    const sheets = getSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${SHEET_USERS}!A:F`,
      });

      const rows = response.data.values || [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row[COLUMN_INDICES_USERS.email] === email) {
          return {
            googleId: row[COLUMN_INDICES_USERS.googleId],
            email: row[COLUMN_INDICES_USERS.email],
            name: row[COLUMN_INDICES_USERS.name],
            picture: row[COLUMN_INDICES_USERS.picture],
            createdAt: row[COLUMN_INDICES_USERS.createdAt],
            lastLogin: row[COLUMN_INDICES_USERS.lastLogin],
            rowIndex: i + 1, // 1-based index
          };
        }
      }
      return null;
    } catch (error) {
      logger.error("查找使用者失敗", { error: error.message });
      return null;
    }
  }

  /**
   * 建立使用者
   */
  async createUser(userData) {
    const sheets = getSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

    try {
      const now = new Date().toISOString();
      const row = [
        userData.id,
        userData.email,
        userData.name,
        userData.picture,
        now, // CreatedAt
        now, // LastLogin
      ];

      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${SHEET_USERS}!A:F`,
        valueInputOption: "RAW",
        requestBody: { values: [row] },
      });

      logger.info("使用者建立成功", { googleId: userData.id });
      return true;
    } catch (error) {
      logger.error("建立使用者失敗", { error: error.message });
      return false;
    }
  }

  /**
   * 更新使用者登入時間
   */
  async updateUserLogin(googleId) {
    const user = await this.findUser(googleId);
    if (!user) return false;

    const sheets = getSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
    const now = new Date().toISOString();

    try {
      const range = `${SHEET_USERS}!F${user.rowIndex}`;
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: "RAW",
        requestBody: { values: [[now]] },
      });
      return true;
    } catch (error) {
      logger.error("更新登入時間失敗", { error: error.message });
      return false;
    }
  }

  // ========================================
  // 權益管理 (Entitlements)
  // ========================================

  /**
   * 取得使用者權益
   */
  async getUserEntitlements(userId) {
    const sheets = getSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${SHEET_ENTITLEMENTS}!A:M`, // 擴充到 M 欄
      });

      const rows = response.data.values || [];
      const entitlements = [];
      const now = new Date();

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row[COLUMN_INDICES_ENTITLEMENTS.userId] === userId) {
          const expiryDateStr = row[COLUMN_INDICES_ENTITLEMENTS.expiryDate];
          let status = row[COLUMN_INDICES_ENTITLEMENTS.status];

          // 自動檢查過期
          if (status === "active" && expiryDateStr) {
            const expiryDate = new Date(expiryDateStr);
            if (expiryDate < now) {
              status = "expired";
            }
          }

          if (status === "active") {
            entitlements.push({
              entitlementId: row[COLUMN_INDICES_ENTITLEMENTS.entitlementId],
              userId: row[COLUMN_INDICES_ENTITLEMENTS.userId],
              productId: row[COLUMN_INDICES_ENTITLEMENTS.productId],
              type: row[COLUMN_INDICES_ENTITLEMENTS.type],
              status: status,
              startDate: row[COLUMN_INDICES_ENTITLEMENTS.startDate],
              expiryDate: expiryDateStr,
              sourceOrderId: row[COLUMN_INDICES_ENTITLEMENTS.sourceOrderId],
              periodTradeNo: row[COLUMN_INDICES_ENTITLEMENTS.periodTradeNo] || "",
              autoRenew: row[COLUMN_INDICES_ENTITLEMENTS.autoRenew] === "true",
              cancelledAt: row[COLUMN_INDICES_ENTITLEMENTS.cancelledAt] || "",
              lastRenewalDate: row[COLUMN_INDICES_ENTITLEMENTS.lastRenewalDate] || "",
              nextBillingDate: row[COLUMN_INDICES_ENTITLEMENTS.nextBillingDate] || "",
            });
          }
        }
      }
      return entitlements;
    } catch (error) {
      logger.error("取得權益失敗", { error: error.message });
      return [];
    }
  }

  /**
   * 授予或延長權益
   */
  async grantEntitlement(userId, product, orderId) {
    const sheets = getSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
    const now = new Date();

    try {
      // 先檢查是否已有該商品的權益
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${SHEET_ENTITLEMENTS}!A:M`, // 擴充到 M 欄
      });

      const rows = response.data.values || [];
      let existingRowIndex = -1;
      let existingEntitlement = null;

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row[COLUMN_INDICES_ENTITLEMENTS.userId] === userId && 
            row[COLUMN_INDICES_ENTITLEMENTS.productId] === product.id) {
          existingRowIndex = i + 1;
          existingEntitlement = row;
          break;
        }
      }

      // 計算新的到期日
      let newExpiryDate = null;
      if (product.type === "subscription" && product.periodConfig) {
        let baseDate = new Date(now); // ← 建立新的 Date 物件
        // 如果現有權益未過期，從現有到期日開始延長
        if (existingEntitlement && existingEntitlement[COLUMN_INDICES_ENTITLEMENTS.status] === "active") {
          const currentExpiry = new Date(existingEntitlement[COLUMN_INDICES_ENTITLEMENTS.expiryDate]);
          if (currentExpiry > now) {
            baseDate = new Date(currentExpiry); // ← 也建立新物件
          }
        }

        const daysToAdd = product.periodConfig.periodType === "month" ? 32 : 366;
        baseDate.setDate(baseDate.getDate() + daysToAdd);
        newExpiryDate = baseDate.toISOString();
      }

      // 計算下次扣款日 (NextBillingDate)
      let nextBillingDate = null;
      if (product.type === "subscription" && newExpiryDate) {
        nextBillingDate = newExpiryDate; // 下次扣款日就是到期日
      }

      // 取得 PeriodTradeNo (從 Orders 表查詢)
      let periodTradeNo = "";
      if (product.type === "subscription") {
        try {
          const order = await this.getOrderByTradeNo(orderId);
          if (order && order.periodTradeNo) {
            periodTradeNo = order.periodTradeNo;
          }
        } catch (e) {
          logger.warn("無法取得 PeriodTradeNo", { orderId });
        }
      }

      if (existingRowIndex !== -1) {
        // 更新現有權益
        const range = `${SHEET_ENTITLEMENTS}!E${existingRowIndex}:H${existingRowIndex}`;
        const updates = [
          "active", // Status
          existingEntitlement[COLUMN_INDICES_ENTITLEMENTS.startDate], // StartDate 不變
          newExpiryDate || "", // ExpiryDate
          orderId // Update source order
        ];
        
        // 這裡我們只更新 Status, Expiry, SourceOrder
        // 注意：Google Sheets API update 需要對應欄位
        // 為了簡單，我們更新整行
        const fullRow = [...existingEntitlement];
        fullRow[COLUMN_INDICES_ENTITLEMENTS.status] = "active";
        fullRow[COLUMN_INDICES_ENTITLEMENTS.expiryDate] = newExpiryDate || "";
        fullRow[COLUMN_INDICES_ENTITLEMENTS.sourceOrderId] = orderId;
        fullRow[COLUMN_INDICES_ENTITLEMENTS.periodTradeNo] = periodTradeNo || existingEntitlement[COLUMN_INDICES_ENTITLEMENTS.periodTradeNo] || "";
        fullRow[COLUMN_INDICES_ENTITLEMENTS.autoRenew] = "true"; // 預設自動續約
        fullRow[COLUMN_INDICES_ENTITLEMENTS.cancelledAt] = existingEntitlement[COLUMN_INDICES_ENTITLEMENTS.cancelledAt] || ""; // 保留原值
        fullRow[COLUMN_INDICES_ENTITLEMENTS.lastRenewalDate] = now.toISOString(); // 更新續費日
        fullRow[COLUMN_INDICES_ENTITLEMENTS.nextBillingDate] = nextBillingDate || ""; // 下次扣款日

        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${SHEET_ENTITLEMENTS}!A${existingRowIndex}:M${existingRowIndex}`, // 擴充到 M
          valueInputOption: "RAW",
          requestBody: { values: [fullRow] },
        });
        logger.info("權益更新成功", { userId, productId: product.id });
      } else {
        // 建立新權益
        const entitlementId = `ent_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const row = [
          entitlementId,
          userId,
          product.id,
          product.type,
          "active",
          now.toISOString(),
          newExpiryDate || "",
          orderId,
          periodTradeNo || "",          // I - PeriodTradeNo
          "true",                        // J - AutoRenew (預設開啟)
          "",                            // K - CancelledAt
          now.toISOString(),             // L - LastRenewalDate (首次即為開始)
          nextBillingDate || "",         // M - NextBillingDate
        ];

        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `${SHEET_ENTITLEMENTS}!A:M`, // 擴充到 M
          valueInputOption: "RAW",
          requestBody: { values: [row] },
        });
        logger.info("權益建立成功", { userId, productId: product.id });
      }

      return true;
    } catch (error) {
      logger.error("授予權益失敗", { error: error.message });
      return false;
    }
  }

  /**
   * 取消訂閱
   * 更新 Entitlements 狀態：設定 cancelledAt, autoRenew=false
   * 但權益維持到 expiryDate
   */
  async cancelSubscription(userId, periodTradeNo) {
    const sheets = getSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

    try {
      // 查詢該 periodTradeNo 對應的 entitlement
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${SHEET_ENTITLEMENTS}!A:M`,
      });

      const rows = response.data.values || [];
      let targetRowIndex = -1;
      let entitlement = null;

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row[COLUMN_INDICES_ENTITLEMENTS.userId] === userId && 
            row[COLUMN_INDICES_ENTITLEMENTS.periodTradeNo] === periodTradeNo &&
            row[COLUMN_INDICES_ENTITLEMENTS.status] === "active") {
          targetRowIndex = i + 1;
          entitlement = row;
          break;
        }
      }

      if (targetRowIndex === -1) {
        logger.warn("找不到要取消的訂閱", { userId, periodTradeNo });
        return {
          success: false,
          error: "找不到有效的訂閱",
        };
      }

      // 更新 Entitlement
      const now = new Date().toISOString();
      const fullRow = [...entitlement];
      fullRow[COLUMN_INDICES_ENTITLEMENTS.autoRenew] = "false"; // 關閉自動續約
      fullRow[COLUMN_INDICES_ENTITLEMENTS.cancelledAt] = now;   // 記錄取消時間

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SHEET_ENTITLEMENTS}!A${targetRowIndex}:M${targetRowIndex}`,
        valueInputOption: "RAW",
        requestBody: { values: [fullRow] },
      });

      logger.info("訂閱取消成功", {
        userId,
        periodTradeNo,
        productId: entitlement[COLUMN_INDICES_ENTITLEMENTS.productId],
      });

      return {
        success: true,
        entitlement: {
          productId: entitlement[COLUMN_INDICES_ENTITLEMENTS.productId],
          expiryDate: entitlement[COLUMN_INDICES_ENTITLEMENTS.expiryDate],
        },
      };
    } catch (error) {
      logger.error("取消訂閱失敗", { error: error.message });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // ========================================
  // 訂閱扣款記錄 (Period Payments)
  // ========================================

  /**
   * 記錄訂閱期數扣款
   */
  async recordPeriodPayment(paymentData) {
    const sheets = getSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

    try {
      const {
        periodTradeNo,
        baseOrderNo,
        sequenceNo,
        tradeSeq,
        amount,
        status,
        paymentTime,
        remark = "",
      } = paymentData;

      const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      
      const row = [
        paymentId,
        periodTradeNo,
        baseOrderNo,
        sequenceNo,
        tradeSeq,
        amount,
        status,
        paymentTime || new Date().toISOString(),
        remark,
      ];

      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${SHEET_PERIOD_PAYMENTS}!A:I`,
        valueInputOption: "RAW",
        requestBody: { values: [row] },
      });

      logger.info("訂閱扣款記錄成功", { periodTradeNo, sequenceNo, amount });
      return true;
    } catch (error) {
      logger.error("記錄訂閱扣款失敗", { error: error.message });
      return false;
    }
  }

  /**
   * 取得訂閱的所有扣款記錄
   */
  async getPeriodPayments(baseOrderNo) {
    const sheets = getSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${SHEET_PERIOD_PAYMENTS}!A:I`,
      });

      const rows = response.data.values || [];
      const payments = [];

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row[COLUMN_INDICES_PERIOD_PAYMENTS.baseOrderNo] === baseOrderNo) {
          payments.push({
            paymentId: row[COLUMN_INDICES_PERIOD_PAYMENTS.paymentId],
            periodTradeNo: row[COLUMN_INDICES_PERIOD_PAYMENTS.periodTradeNo],
            baseOrderNo: row[COLUMN_INDICES_PERIOD_PAYMENTS.baseOrderNo],
            sequenceNo: parseInt(row[COLUMN_INDICES_PERIOD_PAYMENTS.sequenceNo]) || 0,
            tradeSeq: row[COLUMN_INDICES_PERIOD_PAYMENTS.tradeSeq],
            amount: parseFloat(row[COLUMN_INDICES_PERIOD_PAYMENTS.amount]),
            status: row[COLUMN_INDICES_PERIOD_PAYMENTS.status],
            paymentTime: row[COLUMN_INDICES_PERIOD_PAYMENTS.paymentTime],
            remark: row[COLUMN_INDICES_PERIOD_PAYMENTS.remark],
          });
        }
      }

      // 按期數排序
      payments.sort((a, b) => a.sequenceNo - b.sequenceNo);
      return payments;
    } catch (error) {
      logger.error("取得訂閱扣款記錄失敗", { error: error.message });
      return [];
    }
  }
}

// 導出單例
export const googleSheetsDB = new GoogleSheetsOrderDatabase();
