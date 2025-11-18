import { body } from "express-validator";
import { TURNSTILE_CONFIG } from "../config/constants.js";

/**
 * /create-payment 端點驗證規則
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
