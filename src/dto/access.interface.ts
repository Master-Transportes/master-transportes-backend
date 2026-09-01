import type { UserStatus } from "./shared.types.ts";

export interface SignInDTO {
  email: string;
  password: string;
  deviceId?: string;
}

export interface SignInResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  deviceId?: string;
}

export interface RefreshDTO {
  refreshToken: string;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LogoutResponse {
  message: string;
}

export interface RevokeSessionParams {
  sessionId: string;
}

export interface SessionItem {
  id: string;
  deviceId: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  isCurrent: boolean;
}

export interface ListSessionsResponse {
  sessions: SessionItem[];
}

export interface GetMeResponse {
  id: string;
  fullName: string;
  email: string;
  status: UserStatus;
  banReason: string | null;
}
