/**
 * 商品型別定義
 */

import type { Currency } from '../common';

export type ProductType = 'subscription' | 'one_time';

export type ProductStatus = 'active' | 'inactive';

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: Currency;
  type: ProductType;
  /** 訂閱週期（月數），僅適用於訂閱制商品 */
  billingCycle?: number;
  status: ProductStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type ProductDTO = Omit<Product, 'createdAt' | 'updatedAt'>;

export interface ProductListResponse {
  products: Product[];
}

export interface ProductResponse {
  product: Product;
}
