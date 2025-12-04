/**
 * 訂單型別定義
 */

import type { Currency } from '../common';

export type OrderStatus = 'pending' | 'paid' | 'failed' | 'cancelled';

export type PaymentMethod = 'credit_card' | 'atm' | 'convenience_store' | 'webatm';

export interface Order {
  id: string;
  tradeNo: string;
  userId: string;
  productId: string;
  amount: number;
  currency: Currency;
  status: OrderStatus;
  paymentMethod?: PaymentMethod;
  paymentGateway: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/** 隱藏敏感信息的訂單回應 */
export type OrderResponse = Omit<Order, 'userId'>;

export interface OrderListResponse {
  orders: OrderResponse[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateOrderRequest {
  userId: string;
  productId: string;
  amount: number;
  currency: Currency;
  paymentGateway: string;
}

export interface UpdateOrderStatusRequest {
  status: OrderStatus;
  paymentMethod?: PaymentMethod;
  metadata?: Record<string, unknown>;
}
