/**
 * 通用型別定義
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export type Currency = 'TWD' | 'USD';

export interface RequestUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
  role: 'user' | 'admin';
}

export interface Entitlement {
  id: string;
  userId: string;
  type: 'subscription' | 'one_time';
  productId: string;
  status: 'active' | 'expired' | 'cancelled';
  startDate?: Date;
  endDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentConfig {
  merchantId: string;
  apiUrl: string;
  hashKey: string;
  hashIv: string;
  returnUrl: string;
}
