// Google Apps Script for Payuni Payment Management
// 用於管理支付訂單和接收通知更新

const SHEET_ID = "";
const SHEET_NAME = "訂單記錄";
const WEBHOOK_PATH = "/payuni-webhook";

// ============ 初始化 ============

/**
 * 初始化 Google Sheet
 * 第一次使用時運行此函數
 */
function initializeSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);

  // 如果 sheet 不存在，建立新的
  if (!sheet) {
    Logger.log("Sheet 不存在，建立新的: " + SHEET_NAME);
    sheet = ss.insertSheet(SHEET_NAME);
  }

  // 設定表頭
  const headers = ["訂單編號", "商店ID", "交易金額", "訂單狀態", "Email", "建立時間", "完成時間", "交易序號", "備註"];

  sheet.getRange("A1:I1").setValues([headers]);
  sheet.setFrozenRows(1);

  Logger.log("Sheet 初始化完成");
}

// ============ 建立訂單 ============

/**
 * 建立新訂單紀錄
 * @param {string} tradeNo - 訂單編號
 * @param {string} merID - 商店 ID
 * @param {number} tradeAmt - 交易金額
 * @param {string} email - 客戶 Email
 * @returns {boolean} 是否成功建立
 */
function createOrder(tradeNo, merID, tradeAmt, email) {
  try {
    Logger.log("Creating order with tradeNo: " + tradeNo);
    Logger.log("SHEET_ID: " + SHEET_ID);
    Logger.log("SHEET_NAME: " + SHEET_NAME);

    const ss = SpreadsheetApp.openById(SHEET_ID);
    Logger.log("Spreadsheet opened successfully");

    let sheet = ss.getSheetByName(SHEET_NAME);
    Logger.log("Sheet retrieved: " + (sheet ? "success" : "failed"));

    if (!sheet) {
      Logger.log("Sheet 不存在，請先執行 initializeSheet()");
      return false;
    }

    const now = new Date();
    const newRow = [
      tradeNo, // 訂單編號
      merID, // 商店 ID
      tradeAmt, // 交易金額
      "待支付", // 訂單狀態
      email, // Email
      now, // 建立時間
      "", // 完成時間
      "", // 交易序號
      "", // 備註
    ];

    sheet.appendRow(newRow);
    Logger.log(`訂單建立成功: ${tradeNo}`);
    return true;
  } catch (error) {
    Logger.log(`建立訂單失敗: ${error}`);
    Logger.log(`Stack: ${error.stack}`);
    return false;
  }
}

// ============ 處理通知 ============

/**
 * 處理來自後端的支付通知
 * 這個函數應該被配置為 POST webhook
 * @param {object} e - 來自 doPost 的請求物件
 * @returns {object} 回應物件
 */
function handlePaymentNotification(e) {
  try {
    const postData = JSON.parse(e.postData.contents);

    Logger.log("收到通知: " + JSON.stringify(postData));

    // 根據不同的通知類型處理
    const result = updateOrderStatus(postData);

    if (result) {
      return ContentService.createTextOutput("SUCCESS").setMimeType(ContentService.MimeType.TEXT);
    } else {
      return ContentService.createTextOutput("FAILED").setMimeType(ContentService.MimeType.TEXT);
    }
  } catch (error) {
    Logger.log(`處理通知失敗: ${error}`);
    return ContentService.createTextOutput("ERROR").setMimeType(ContentService.MimeType.TEXT);
  }
}

/**
 * 更新訂單狀態
 * @param {object} data - 通知資料
 * @returns {boolean} 是否成功更新
 */
function updateOrderStatus(data) {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);

    if (!sheet) {
      Logger.log("Sheet 不存在");
      return false;
    }

    // 從通知資料中獲取訂單編號
    const tradeNo = data.MerTradeNo || data.tradeNo;
    const tradeSeq = data.TradeSeq || data.tradeSeq;
    const status = data.Status || "已完成";

    // 查找對應的行
    const range = sheet.getDataRange();
    const values = range.getValues();

    for (let i = 1; i < values.length; i++) {
      if (values[i][0] === tradeNo) {
        // 找到訂單
        const now = new Date();

        // 更新狀態欄
        sheet.getRange(i + 1, 4).setValue(status);

        // 更新完成時間（現在是第 7 欄）
        sheet.getRange(i + 1, 7).setValue(now);

        // 更新交易序號（現在是第 8 欄）
        if (tradeSeq) {
          sheet.getRange(i + 1, 8).setValue(tradeSeq);
        }

        // 更新備註（現在是第 9 欄）
        const remark = JSON.stringify(data);
        sheet.getRange(i + 1, 9).setValue(remark);

        Logger.log(`訂單已更新: ${tradeNo} - ${status}`);
        return true;
      }
    }

    Logger.log(`找不到訂單: ${tradeNo}`);
    return false;
  } catch (error) {
    Logger.log(`更新訂單狀態失敗: ${error}`);
    return false;
  }
}

// ============ Web App 端點 ============

/**
 * 作為 Web App 的 POST 端點
 * 配置: 部署 > 新增部署 > 網路應用程式 > 以身分執行 > 授權類型
 */
function doPost(e) {
  const action = e.parameter.action || "";

  try {
    if (action === "createOrder") {
      // 新增訂單
      Logger.log("Received createOrder request");
      const postData = JSON.parse(e.postData.contents);
      Logger.log("Post data: " + JSON.stringify(postData));

      const result = createOrder(postData.tradeNo, postData.merID, postData.tradeAmt, postData.email);
      Logger.log("createOrder result: " + result);

      if (result) {
        return ContentService.createTextOutput(JSON.stringify({ success: true, message: "訂單建立成功" })).setMimeType(ContentService.MimeType.JSON);
      } else {
        return ContentService.createTextOutput(JSON.stringify({ success: false, message: "訂單建立失敗" })).setMimeType(ContentService.MimeType.JSON);
      }
    } else if (action === "updateOrder") {
      // 更新訂單
      const postData = JSON.parse(e.postData.contents);
      const result = updateOrderStatus(postData);

      if (result) {
        return ContentService.createTextOutput(JSON.stringify({ success: true, message: "訂單更新成功" })).setMimeType(ContentService.MimeType.JSON);
      } else {
        return ContentService.createTextOutput(JSON.stringify({ success: false, message: "訂單更新失敗" })).setMimeType(ContentService.MimeType.JSON);
      }
    } else if (action === "webhook") {
      // 支付通知 webhook
      return handlePaymentNotification(e);
    } else {
      return ContentService.createTextOutput(JSON.stringify({ success: false, message: "無效的 action" })).setMimeType(ContentService.MimeType.JSON);
    }
  } catch (error) {
    Logger.log(`doPost 錯誤: ${error}`);
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: `錯誤: ${error}` })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 作為 Web App 的 GET 端點
 */
function doGet(e) {
  const path = e.parameter.action || "status";

  if (path === "status") {
    const html = HtmlService.createHtmlOutput("<h1>Google Apps Script 執行中</h1><p>這是一個 Payuni 支付通知接收器。</p>");
    return html;
  }

  return HtmlService.createHtmlOutput("Invalid request");
}

// ============ 查詢函數 ============

/**
 * 取得所有訂單
 * @returns {array} 訂單列表
 */
function getAllOrders() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();

  // 跳過表頭
  return data.slice(1);
}

/**
 * 根據訂單編號取得訂單
 * @param {string} tradeNo - 訂單編號
 * @returns {object} 訂單資訊
 */
function getOrderByTradeNo(tradeNo) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === tradeNo) {
      return {
        tradeNo: data[i][0],
        merID: data[i][1],
        amount: data[i][2],
        status: data[i][3],
        email: data[i][4],
        createdAt: data[i][5],
        completedAt: data[i][6],
        tradeSeq: data[i][7],
        remark: data[i][8],
      };
    }
  }

  return null;
}

/**
 * 統計各狀態的訂單數量
 * @returns {object} 統計結果
 */
function getOrderStats() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();

  const stats = {
    待支付: 0,
    已完成: 0,
    已失敗: 0,
    其他: 0,
  };

  for (let i = 1; i < data.length; i++) {
    const status = data[i][3];
    if (status in stats) {
      stats[status]++;
    } else {
      stats["其他"]++;
    }
  }

  return stats;
}

// ============ 測試函數 ============

/**
 * 測試建立訂單
 */
function testCreateOrder() {
  const tradeNo = "test" + new Date().getTime();
  const merID = "MERCHANT001";
  const tradeAmt = 100;
  const email = "test@example.com";

  const result = createOrder(tradeNo, merID, tradeAmt, email);
  Logger.log("測試結果: " + result);
}

/**
 * 測試更新訂單
 */
function testUpdateOrder() {
  const testData = {
    MerTradeNo: "test" + (new Date().getTime() - 5000), // 使用較早的時間戳
    TradeSeq: "SEQ123456",
    Status: "已完成",
    extra: "測試備註",
  };

  const result = updateOrderStatus(testData);
  Logger.log("更新測試結果: " + result);
}

/**
 * 測試查詢
 */
function testQuery() {
  Logger.log("所有訂單: " + JSON.stringify(getAllOrders()));
  Logger.log("訂單統計: " + JSON.stringify(getOrderStats()));
}
