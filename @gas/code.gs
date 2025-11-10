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

  if (!sheet) {
    Logger.log("Sheet 不存在，建立新的: " + SHEET_NAME);
    sheet = ss.insertSheet(SHEET_NAME);
  }

  const headers = ["訂單編號", "商店ID", "交易金額", "訂單狀態", "Email", "建立時間", "完成時間", "交易序號", "備註", "商品ID", "商品名稱"];

  sheet.getRange("A1:K1").setValues([headers]);
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
 * @param {string} productID - 商品ID
 * @returns {boolean} 是否成功建立
 */
function createOrder(tradeNo, merID, tradeAmt, email, productID, productName) {
  try {
    Logger.log("Creating order with tradeNo: " + tradeNo);
    const ss = SpreadsheetApp.openById(SHEET_ID);
    let sheet = ss.getSheetByName(SHEET_NAME);

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
      productID, // 商品ID
      productName, // 商品名稱
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

// ============ 處理通知與查詢 ============

/**
 * 處理來自後端的支付通知
 * @param {object} e - 來自 doPost 的請求物件
 * @returns {object} 回應物件
 */
function handlePaymentNotification(e) {
  try {
    const postData = JSON.parse(e.postData.contents);
    Logger.log("收到通知: " + JSON.stringify(postData));
    const result = updateOrderStatus(postData);

    if (result) {
      return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
    } else {
      return ContentService.createTextOutput(JSON.stringify({ success: false, message: "GAS 更新失敗" })).setMimeType(ContentService.MimeType.JSON);
    }
  } catch (error) {
    Logger.log(`處理通知失敗: ${error}`);
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: `處理通知錯誤: ${error}` })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 查找待支付訂單
 * @param {object} e - 來自 doPost 的請求物件
 * @returns {object} 回應物件
 */
function handleFindOrder(e) {
  try {
    const { email, productID } = JSON.parse(e.postData.contents);
    if (!email || !productID) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, message: "缺少 email 或 productID" })).setMimeType(ContentService.MimeType.JSON);
    }

    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, message: "Sheet 不存在" })).setMimeType(ContentService.MimeType.JSON);
    }

    const data = sheet.getDataRange().getValues();
    
    for (let i = data.length - 1; i > 0; i--) {
      const row = data[i];
      const order = {
        tradeNo: row[0],
        merID: row[1],
        tradeAmt: row[2],
        status: row[3],
        email: row[4],
        productID: row[9]
      };

      if (order.email === email && order.productID === productID && order.status === "待支付") {
        Logger.log("找到現有待支付訂單: " + order.tradeNo);
        return ContentService.createTextOutput(JSON.stringify({ success: true, order: order })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    Logger.log("找不到符合條件的待支付訂單");
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: "找不到訂單" })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    Logger.log(`查找訂單失敗: ${error}`);
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: `查找訂單錯誤: ${error}` })).setMimeType(ContentService.MimeType.JSON);
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

    const tradeNo = data.MerTradeNo || data.tradeNo;
    const tradeSeq = data.TradeSeq || data.tradeSeq;
    const status = data.Status || "已完成";

    const range = sheet.getDataRange();
    const values = range.getValues();

    for (let i = 1; i < values.length; i++) {
      if (values[i][0] === tradeNo) {
        const now = new Date();
        sheet.getRange(i + 1, 4).setValue(status);
        sheet.getRange(i + 1, 7).setValue(now);
        if (tradeSeq) {
          sheet.getRange(i + 1, 8).setValue(tradeSeq);
        }
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

function doPost(e) {
  const action = e.parameter.action || "";

  try {
    if (action === "createOrder") {
      Logger.log("Received createOrder request");
      const postData = JSON.parse(e.postData.contents);
      const result = createOrder(postData.tradeNo, postData.merID, postData.tradeAmt, postData.email, postData.productID, postData.productName);
      if (result) {
        return ContentService.createTextOutput(JSON.stringify({ success: true, message: "訂單建立成功" })).setMimeType(ContentService.MimeType.JSON);
      } else {
        return ContentService.createTextOutput(JSON.stringify({ success: false, message: "訂單建立失敗" })).setMimeType(ContentService.MimeType.JSON);
      }
    } else if (action === "updateOrder") {
      return handlePaymentNotification(e);
    } else if (action === "findOrder") {
      return handleFindOrder(e);
    } else if (action === "webhook") {
      return handlePaymentNotification(e);
    } else {
      return ContentService.createTextOutput(JSON.stringify({ success: false, message: "無效的 action" })).setMimeType(ContentService.MimeType.JSON);
    }
  } catch (error) {
    Logger.log(`doPost 錯誤: ${error}`);
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: `錯誤: ${error}` })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  const path = e.parameter.action || "status";
  if (path === "status") {
    return HtmlService.createHtmlOutput("<h1>Google Apps Script 執行中</h1><p>這是一個 Payuni 支付通知接收器。</p>");
  }
  return HtmlService.createHtmlOutput("Invalid request");
}

// ============ 查詢函數 ============

function getAllOrders() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  return data.slice(1);
}

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
        productID: data[i][9],
        productName: data[i][10],
      };
    }
  }
  return null;
}

function getOrderStats() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  const stats = { 待支付: 0, 已完成: 0, 已失敗: 0, 其他: 0 };
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

function testCreateOrder() {
  const tradeNo = "test" + new Date().getTime();
  const merID = "MERCHANT001";
  const tradeAmt = 100;
  const email = "test@example.com";
  const productID = "P001";
  const result = createOrder(tradeNo, merID, tradeAmt, email, productID);
  Logger.log("測試結果: " + result);
}

function testUpdateOrder() {
  const testData = {
    MerTradeNo: "test" + (new Date().getTime() - 5000),
    TradeSeq: "SEQ123456",
    Status: "已完成",
  };
  const result = updateOrderStatus(testData);
  Logger.log("更新測試結果: " + result);
}

function testQuery() {
  Logger.log("所有訂單: " + JSON.stringify(getAllOrders()));
  Logger.log("訂單統計: " + JSON.stringify(getOrderStats()));
}
