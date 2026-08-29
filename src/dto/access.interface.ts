import type { UserStatus } from "./shared.types.ts";

export interface SignInDTO {
  email: string;
  password: string;
}

export interface SignInResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
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

export interface GetMeResponse {
  id: string;
  fullName: string;
  email: string;
  status: UserStatus;
  banReason: string | null;
}
