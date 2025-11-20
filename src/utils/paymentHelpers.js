import { validationResult } from "express-validator";
import { v4 as uuidv4 } from "uuid";
import { PaymentErrors } from "./errors.js";

/**
 * 驗證支付請求的通用邏輯
 * @returns {Object} { product, userEmail, turnstileToken, productID }
 */
export function validatePaymentRequest(req, products) {
  // 1. 檢查登入狀態
  if (!req.session.user) {
    throw PaymentErrors.Unauthorized();
  }

  // 2. 驗證參數
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw PaymentErrors.BadRequest("輸入資料不正確", {
      details: errors.array().map(e => e.msg)
    });
  }

  const { turnstileToken, productID } = req.body;
  const userEmail = req.session.user.email;

  // 3. 查找商品
  const product = products.find(p => p.id === productID);
  if (!product) {
    throw PaymentErrors.NotFound("找不到該商品", { productID });
  }

  return {
    product,
    userEmail,
    turnstileToken,
    productID,
  };
}

/**
 * 生成訂單編號
 */
export function generateTradeNo() {
  return uuidv4().replace(/-/g, "").substring(0, 20);
}

/**
 * 構建訂單資料物件
 */
export function buildOrderData(tradeNo, product, userEmail, merchantID, sessionUser, productType = null) {
  return {
    tradeNo,
    merID: merchantID,
    tradeAmt: product.price,
    email: userEmail,
    productID: product.id,
    productName: product.name,
    ...(productType && { productType }),
    ...(sessionUser && {
      userGoogleId: sessionUser.id,
      userEmail: sessionUser.email,
      userName: sessionUser.name,
    }),
  };
}
