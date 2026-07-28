import type { Role, UserStatus } from "@/interfaces/user-types";

export interface SignInDTO {
  login: string;
  password: string;
}

export interface SignInResponse {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  expiresIn: number;
}

export interface RefreshDTO {
  refreshToken: string;
  sessionId: string;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  expiresIn: number;
}

export interface LogoutResponse {
  message: string;
}

export interface GetMeResponse {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  status: UserStatus;
  banReason: string | null;
}
