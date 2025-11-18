/**
 * 訂單資料庫提供者
 * 提供統一的資料庫實例，支援未來切換不同的資料庫實現
 */

import { GoogleSheetsOrderDatabase } from "./GoogleSheets.js";

/**
 * 初始化並導出資料庫實例
 */
let dbInstance = null;

/**
 * 取得資料庫實例（單例模式）
 */
export function getOrderDatabase() {
  if (!dbInstance) {
    const dbType = process.env.ORDER_DATABASE_TYPE || "google-sheets";

    switch (dbType) {
      case "google-sheets":
        dbInstance = new GoogleSheetsOrderDatabase();
        break;
      // 未來可以添加其他資料庫實現
      // case "mongodb":
      //   dbInstance = new MongoDBOrderDatabase();
      //   break;
      // case "postgresql":
      //   dbInstance = new PostgreSQLOrderDatabase();
      //   break;
      default:
        throw new Error(`未知的資料庫類型: ${dbType}`);
    }
  }

  return dbInstance;
}

/**
 * 重置資料庫實例（用於測試）
 */
export function resetOrderDatabase() {
  dbInstance = null;
}

export default {
  getOrderDatabase,
  resetOrderDatabase,
};
