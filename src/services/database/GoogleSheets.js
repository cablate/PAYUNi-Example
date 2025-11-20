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
];

const COLUMN_INDICES = {
  tradeNo: 0,      // A - 訂單編號
  merID: 1,        // B - 商店ID
  tradeAmt: 2,     // C - 交易金額
  status: 3,       // D - 訂單狀態
  email: 4,        // E - Email
  createdAt: 5,    // F - 建立時間
  completedAt: 6,  // G - 完成時間
  tradeSeq: 7,     // H - 交易序號
  remark: 8,       // I - 備註
  productID: 9,    // J - 商品ID
  productName: 10, // K - 商品名稱
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

      // 寫入標題欄位
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SHEET_NAME}!A1:K1`,
        valueInputOption: "RAW",
        requestBody: {
          values: [HEADERS],
        },
      });

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
        range: `${SHEET_NAME}!A:K`,
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
      ];

      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${SHEET_NAME}!A:K`,
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
        range: `${SHEET_NAME}!A:K`,
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
      ];

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SHEET_NAME}!A${rowNum}:K${rowNum}`,
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
        range: `${SHEET_NAME}!A:K`,
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
        range: `${SHEET_NAME}!A:K`,
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
        range: `${SHEET_NAME}!A:K`,
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
        range: `${SHEET_NAME}!A:K`,
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
}

// 導出單例
export const googleSheetsDB = new GoogleSheetsOrderDatabase();
