/**
 * 錯誤型別定義
 */

export type ErrorCode =
  | 'INVALID_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION_ERROR'
  | 'PAYMENT_ERROR'
  | 'DATABASE_ERROR'
  | 'WEBHOOK_ERROR'
  | 'INTERNAL_SERVER_ERROR';

export interface ApiError {
  code: ErrorCode;
  message: string;
  statusCode: number;
  details?: Record<string, unknown>;
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationErrorDetails {
  errors: ValidationError[];
}

export class CustomError extends Error {
  constructor(
    public code: ErrorCode,
    public statusCode: number,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'CustomError';
  }
}
