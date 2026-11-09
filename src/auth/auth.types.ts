import type { Header } from "encore.dev/api";
import type { AuthRole } from "@/domain/identity/identity.types";

/** Parâmetros recebidos pelo AuthHandler do Encore. */
export interface AuthParams {
  authorization?: Header<"Authorization">;
}

/**
 * Dados de autenticação expostos pelo AuthHandler (`~encore/auth`).
 * Interface pública independente do Drizzle.
 */
export interface AuthData {
  userID: string;
  sessionId: string;
  roles: AuthRole[];
}

export interface AccessTokenInput {
  subject: string;
  sessionId: string;
  tokenId: string;
}

export interface VerifiedAccessToken {
  subject: string;
  sessionId: string;
  tokenId: string;
}

/** Resultado interno da emissão de tokens (convertido em DTO pelos mappers). */
export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  expiresIn: number;
}
