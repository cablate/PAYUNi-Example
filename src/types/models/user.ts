/**
 * 使用者型別定義
 */

import type { Entitlement } from '../common';

export type UserRole = 'user' | 'admin';

export interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
  role: UserRole;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  picture?: string;
  role: UserRole;
  entitlements: Entitlement[];
  lastLoginAt?: Date;
}

export interface UserResponse {
  user: User;
}

export interface UserProfileResponse {
  profile: UserProfile;
}

export interface UpdateUserRequest {
  name?: string;
  picture?: string;
}

export interface LoginResponse {
  loggedIn: boolean;
  user?: User;
}
