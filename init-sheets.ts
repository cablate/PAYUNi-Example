#!/usr/bin/env node

/**
 * Google Sheets 初始化腳本
 * 執行此腳本以初始化 Google Sheets 試算表（建立標題欄位）
 *
 * 使用方法：
 *   node init-sheets.js
 */

import dotenv from "dotenv";
import { getDatabase } from "./src/services/database/provider";
import { printError, printStartupBanner, printSuccess } from "./src/utils/startup";

dotenv.config();

(async (): Promise<void> => {
  printStartupBanner();

  // 檢查必要的環境變數
  if (!process.env.GOOGLE_SHEETS_ID) {
    printError("缺少 GOOGLE_SHEETS_ID 環境變數");
    process.exit(1);
  }

  if (!process.env.GOOGLE_SHEETS_KEY_FILE || process.env.GOOGLE_SHEETS_KEY_FILE === "./google-key.json") {
    // 提醒使用者
    console.log("⚠️  使用預設的 google-key.json 金鑰文件路徑");
  }

  try {
    console.log("\n🔄 正在初始化 Google Sheets 試算表...\n");
    const db = getDatabase();
    await db.initialize();
    console.log("\n");
    printSuccess(0);
    console.log("\n📊 試算表已準備好使用。可以開始建立訂單了！\n");
    process.exit(0);
  } catch (error: any) {
    console.log("\n");
    printError(`❌ 初始化失敗: ${error.message}`);
    console.error("\n詳細錯誤信息:");
    console.error(error);
    process.exit(1);
  }
})();
