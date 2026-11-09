import { APIError, Gateway } from "encore.dev/api";
import { authHandler } from "encore.dev/auth";
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
    throw APIError.unauthenticated("Autenticação necessária.");
  }

  try {
    const claims = await verifyAccessToken(token);
    if (!claims) {
      throw APIError.unauthenticated("Token de acesso inválido ou expirado.");
    }

    const session = await sessionRepository.findActiveById(claims.sessionId);
    if (!session || session.userId !== claims.subject) {
      throw APIError.unauthenticated("Sessão inválida ou expirada.");
    }

    const user = await userRepository.findAuthStateById(claims.subject);
    if (!user || user.status !== AccountStatus.ACTIVE) {
      throw APIError.unauthenticated("Conta indisponível.");
    }

    const roles = await userRepository.findRolesByUserId(claims.subject);

    return {
      userID: claims.subject,
      sessionId: claims.sessionId,
      roles,
    };
  } catch (error) {
    if (error instanceof APIError) throw error;
    if (isDatabaseUnavailable(error)) {
      throw APIError.unavailable("Serviço temporariamente indisponível.");
    }
    throw APIError.internal("Falha ao validar autenticação.");
  }
});

export const gateway = new Gateway({ authHandler: auth });
