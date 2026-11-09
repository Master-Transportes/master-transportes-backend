import type { LoginResponse, RefreshResponse } from "@/dto/auth.dto";
import type { SessionTokens } from "@/auth/auth.types";

export function toLoginResponse(tokens: SessionTokens): LoginResponse {
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    sessionId: tokens.sessionId,
    expiresIn: tokens.expiresIn,
  };
}

export function toRefreshResponse(tokens: SessionTokens): RefreshResponse {
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    sessionId: tokens.sessionId,
    expiresIn: tokens.expiresIn,
  };
}
