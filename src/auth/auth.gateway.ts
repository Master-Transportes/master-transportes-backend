import { APIError, Gateway } from "encore.dev/api";
import log from "encore.dev/log";
import { authHandler } from "encore.dev/auth";
import { ErrorReason } from "@/constants/error-reasons";
import { AccountStatus } from "@/domain/identity/identity.types";
import { isDatabaseUnavailable } from "@/repositories/database-errors";
import { sessionRepository, userRepository } from "@/repositories";
import { verifyAccessToken } from "./auth";
import type { AuthData, AuthParams } from "./auth.types";

function extractBearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;

  const [scheme, token] = authorization.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;

  return token;
}

/**
 * AuthHandler oficial do Encore.
 *
 * PostgreSQL é a fonte de verdade: além de validar o JWT, confirma a sessão
 * (não revogada/expirada), o estado da conta e os papéis EFETIVOS em user_roles.
 * Não há cache de autenticação — consistência e revogação imediata primeiro.
 */
export const auth = authHandler<AuthParams, AuthData>(async params => {
  const token = extractBearerToken(params.authorization);
  if (!token) {
    throw APIError.unauthenticated("Autenticação necessária.").withDetails({
      reason: ErrorReason.AUTHENTICATION_REQUIRED,
    });
  }

  try {
    const claims = await verifyAccessToken(token);
    if (!claims) {
      throw APIError.unauthenticated("Token de acesso inválido ou expirado.").withDetails({
        reason: ErrorReason.INVALID_ACCESS_TOKEN,
      });
    }

    const session = await sessionRepository.findActiveById(claims.sessionId);
    if (!session || session.userId !== claims.subject) {
      throw APIError.unauthenticated("Sessão inválida ou expirada.").withDetails({
        reason: ErrorReason.SESSION_INVALID,
      });
    }

    const user = await userRepository.findAuthStateById(claims.subject);
    if (!user || user.status !== AccountStatus.ACTIVE) {
      throw APIError.unauthenticated("Conta indisponível.").withDetails({ reason: ErrorReason.ACCOUNT_UNAVAILABLE });
    }

    const roles = await userRepository.findRolesByUserId(claims.subject);

    return { userID: claims.subject, sessionId: claims.sessionId, roles };
  } catch (error) {
    if (error instanceof APIError) throw error;
    if (isDatabaseUnavailable(error)) {
      log.error("Banco de dados indisponível ao validar autenticação.");
      throw APIError.unavailable("Serviço temporariamente indisponível.").withDetails({
        reason: ErrorReason.SERVICE_UNAVAILABLE,
      });
    }
    log.error("Falha inesperada ao validar autenticação.");
    throw APIError.internal("Falha ao validar autenticação.");
  }
});

export const gateway = new Gateway({ authHandler: auth });
