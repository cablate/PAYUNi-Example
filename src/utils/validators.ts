import { body } from "express-validator";
import { TURNSTILE_CONFIG } from "../config/constants";

/**
 * 支付請求驗證規則（用於 /create-payment 和 /create-subscription）
 *
 * 驗證請求主體中的欄位，包括：
 * - turnstileToken：Turnstile 安全驗證的 Token
 *
 * 此驗證規則用作 Express 中間件，應在路由處理器之前執行。
 * 驗證結果可通過 validationResult(req) 檢查。
 *
 * @type {Array<Function>} Express 驗證中間件陣列
 *
 * @remarks
 * - Turnstile 驗證可通過環境變數禁用（TURNSTILE_CONFIG.ENABLE）
 * - 若禁用，則不驗證 turnstileToken
 * - Token 最大長度為 2000 字元
 *
 * @example
 * // 在路由中使用
 * router.post('/create-payment', createPaymentValidation, async (req, res) => {
 *   const errors = validationResult(req);
 *   if (!errors.isEmpty()) {
 *     return res.status(400).json({ errors: errors.array() });
 *   }
 *   // 繼續支付流程...
 * });
 *
 * @see {@link https://express-validator.github.io/ express-validator}
 */
export const createPaymentValidation = [
  body("turnstileToken")
    .if(() => TURNSTILE_CONFIG.ENABLE)
    .notEmpty()
    .withMessage("驗證 token 不可為空")
    .isString()
    .withMessage("驗證 token 必須是字串")
    .isLength({ max: 2000 })
    .withMessage("Token 長度異常"),
];
