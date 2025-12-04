/**
 * 訂閱型別定義
 */

export type SubscriptionStatus = 'active' | 'suspended' | 'cancelled' | 'expired';

export type BillingCycle = 1 | 3 | 6 | 12;

export interface Subscription {
  id: string;
  userId: string;
  productId: string;
  status: SubscriptionStatus;
  billingCycle: BillingCycle;
  startDate: Date;
  endDate: Date;
  nextBillingDate: Date;
  lastBilledAt?: Date;
  cancelledAt?: Date;
  reason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubscriptionResponse {
  subscription: Subscription;
}

export interface SubscriptionListResponse {
  subscriptions: Subscription[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateSubscriptionRequest {
  productId: string;
  billingCycle: BillingCycle;
}

export interface CancelSubscriptionRequest {
  reason?: string;
}

export interface UpdateSubscriptionStatusRequest {
  status: SubscriptionStatus;
  reason?: string;
}
