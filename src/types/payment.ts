/**
 * 支付相關型別定義
 */

export type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export type PaymentGateway = 'payuni' | 'stripe' | 'other';

export interface PaymentData {
  MERCHANT_ID: string;
  AMOUNT: string;
  TRADE_NO: string;
  ITEM_DESC: string;
  PAYMENT_TYPE: string;
  RETURN_URL: string;
  NOTIFY_URL: string;
  CUSTOMER_EMAIL: string;
  SIGN: string;
}

export interface PaymentResult {
  success: boolean;
  payUrl?: string;
  data?: PaymentData;
  error?: string;
}

export interface PaymentChecksum {
  merchant_id: string;
  amount: string;
  trade_no: string;
  sign: string;
}

export interface SubscriptionPaymentData {
  MERCHANT_ID: string;
  AMOUNT: string;
  TRADE_NO: string;
  PERIOD_AMOUNT: string;
  PERIOD_TYPE: string;
  PERIOD_POINT: string;
  RETURN_URL: string;
  NOTIFY_URL: string;
  CUSTOMER_EMAIL: string;
  SIGN: string;
}

export interface WebhookValidationResult {
  valid: boolean;
  error?: string;
}

export interface PaymentGatewayConfig {
  merchantId: string;
  apiUrl: string;
  hashKey: string;
  hashIv: string;
}
