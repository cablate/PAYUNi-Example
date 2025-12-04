/**
 * API 請求/回應型別定義
 */

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface CreatePaymentRequest {
  productID: string;
  turnstileToken?: string;
}

export interface PaymentReturnRequest {
  TRADE_NO: string;
  PAID_AMOUNT: string;
  PAYMENT_METHOD: string;
  TIMESTAMP: string;
}

export interface WebhookNotification {
  TRADE_NO: string;
  PAID_AMOUNT: string;
  PAYMENT_METHOD: string;
  TIMESTAMP: string;
  SIGN: string;
}

export interface OrderListRequest {
  page?: number;
  limit?: number;
  status?: string;
}

export interface ClientConfig {
  turnstileEnable: boolean;
  turnstileSiteKey?: string;
}
