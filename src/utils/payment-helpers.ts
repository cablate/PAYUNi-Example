import { validationResult } from "express-validator";
import { v4 as uuidv4 } from "uuid";
import { PaymentErrors } from "./errors";
import type { Request } from "express";

interface Product {
  id: string;
  name: string;
  price: number;
  [key: string]: any;
}

interface SessionUser {
  id: string;
  email: string;
  name: string;
  [key: string]: any;
}

type RequestWithSession = Request & {
  session: {
    user?: SessionUser;
  };
};

/**
 * 驗證支付請求
 *
 * 驗證支付請求的完整性，包括：
 * 1. 確認使用者已登入
 * 2. 驗證請求參數（使用 express-validator）
 * 3. 查詢商品是否存在
 *
 * @param {Object} req - Express 請求物件
 * @param {Object} req.session - 使用者 Session
 * @param {Object} req.session.user - 當前登入使用者
 * @param {string} req.session.user.email - 使用者信箱
 * @param {Object} req.body - 請求主體
 * @param {string} req.body.productID - 商品 ID
 * @param {string} req.body.turnstileToken - Turnstile 驗證 Token
 * @param {Array<Object>} products - 可用商品清單
 *
 * @returns {Object} 驗證通過後返回的資料
 * @returns {Object} 返回.product - 商品物件
 * @returns {string} 返回.userEmail - 使用者信箱
 * @returns {string} 返回.turnstileToken - Turnstile Token
 * @returns {string} 返回.productID - 商品 ID
 *
 * @throws {PaymentError} 若未登入、參數不正確或商品不存在
 *
 * @example
 * try {
 *   const { product, userEmail } = validatePaymentRequest(req, products);
 *   // 繼續支付流程...
 * } catch (error) {
 *   // 處理驗證錯誤
 * }
 */
export function validatePaymentRequest(req: RequestWithSession, products: Product[]): any {
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
 *
 * 使用 UUID v4 生成唯一的訂單編號。
 * 格式：20 位英數字（UUID 去掉連字符後截取前 20 位）
 * 例如：a1b2c3d4e5f6g7h8i9j0
 *
 * @returns {string} 20 位訂單編號
 *
 * @example
 * const tradeNo = generateTradeNo();
 * console.log(tradeNo); // "a1b2c3d4e5f6g7h8i9j0"
 *
 * @remarks
 * - 每次調用都返回不同的編號（基於 UUID v4）
 * - 編號長度固定為 20 位
 * - 可用於 MerTradeNo（商家訂單編號）
 */
export function generateTradeNo(): string {
  return uuidv4().replace(/-/g, "").substring(0, 20);
}

/**
 * 構建訂單資料物件
 *
 * 將支付相關的信息整合成一個完整的訂單資料物件，
 * 用於存儲到資料庫。
 *
 * @param {string} tradeNo - 訂單編號（由 generateTradeNo() 生成）
 * @param {Object} product - 商品物件
 * @param {string} product.id - 商品 ID
 * @param {string} product.name - 商品名稱
 * @param {number} product.price - 商品價格
 * @param {string} userEmail - 使用者信箱
 * @param {string} merchantID - 商家 ID（Payuni 商家 ID）
 * @param {Object} [sessionUser] - 使用者 Session 物件（可選）
 * @param {string} sessionUser.id - 使用者 Google ID
 * @param {string} sessionUser.email - 使用者信箱
 * @param {string} sessionUser.name - 使用者名稱
 * @param {string} [productType] - 商品類型（可選），例如 "subscription"
 *
 * @returns {Object} 訂單資料物件
 * @returns {string} 返回.tradeNo - 訂單編號
 * @returns {string} 返回.merID - 商家 ID
 * @returns {number} 返回.tradeAmt - 交易金額
 * @returns {string} 返回.email - 使用者信箱
 * @returns {string} 返回.productID - 商品 ID
 * @returns {string} 返回.productName - 商品名稱
 * @returns {string} [返回.productType] - 商品類型（如果指定）
 * @returns {string} [返回.userGoogleId] - Google 使用者 ID（如果提供 sessionUser）
 * @returns {string} [返回.userEmail] - 使用者信箱（如果提供 sessionUser）
 * @returns {string} [返回.userName] - 使用者名稱（如果提供 sessionUser）
 *
 * @example
 * const orderData = buildOrderData(
 *   tradeNo,
 *   product,
 *   "user@example.com",
 *   "merchant_123",
 *   sessionUser,
 *   "subscription"
 * );
 * // 結果會被存入資料庫
 */
interface OrderData {
  tradeNo: string;
  merID: string;
  tradeAmt: number;
  email: string;
  productID: string;
  productName: string;
  productType?: string;
  userGoogleId?: string;
  userEmail?: string;
  userName?: string;
}

export function buildOrderData(
  tradeNo: string,
  product: Product,
  userEmail: string,
  merchantID: string,
  sessionUser?: SessionUser,
  productType: string | null = null
): OrderData {
  const baseData: OrderData = {
    tradeNo,
    merID: merchantID,
    tradeAmt: product.price,
    email: userEmail,
    productID: product.id,
    productName: product.name,
  };

  if (productType) {
    baseData.productType = productType;
  }

  if (sessionUser) {
    baseData.userGoogleId = sessionUser.id;
    baseData.userEmail = sessionUser.email;
    baseData.userName = sessionUser.name;
  }

  return baseData;
}
