import { authHandler } from "encore.dev/auth";
import { APIError, Gateway, type Header } from "encore.dev/api";
import log from "encore.dev/log";
import { assertAuthSecretsDistinct } from "@/config/env";
import { ErrorReason } from "@/constants/error-reasons";
import { AccountStatus, type AuthRole } from "@/domain/identity/identity.types";
import { isDatabaseUnavailable } from "@/repositories/database-errors";
import { sessionRepository, userRepository } from "@/repositories";
import { verifyAccessToken } from "./auth";
import type { AuthData, VerifiedAccessToken } from "./auth.types";

// Falha cedo (e sem expor valores) se os segredos de JWT/refresh estiverem
// ausentes, curtos ou iguais. Esse é o ponto de inicialização do AuthHandler.
assertAuthSecretsDistinct();

export interface AuthParams {
  authorization?: Header<"Authorization">;
}

/** Dependências de consulta mínimas para testar a cadeia sem acoplar ao Drizzle. */
export interface AuthLookup {
  verifyAccessToken(token: string): Promise<VerifiedAccessToken | null>;
  findActiveSession(sessionId: string): Promise<{ id: string; userId: string } | null>;
  findUserAuthState(userId: string): Promise<{ id: string; status: AccountStatus } | null>;
  findRoles(userId: string): Promise<AuthRole[]>;
}

const productionLookup: AuthLookup = {
  verifyAccessToken,
  findActiveSession: sessionId => sessionRepository.findActiveById(sessionId),
  findUserAuthState: userId => userRepository.findAuthStateById(userId),
  findRoles: userId => userRepository.findRolesByUserId(userId),
};

export function extractBearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;

  const [scheme, token] = authorization.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;

  return token;
}

/**
 * Identifica o usuário a partir do Bearer token e da fonte de verdade no PostgreSQL:
 * JWT válido → sessão ativa → conta ativa → papéis efetivos.
 *
 * Falhas aqui são de autenticação (401): token/sessão/conta não formam uma
 * identidade válida para a requisição. Depois que login/refresh provam a
 * credencial, indisponibilidade de conta/perfil é tratada como 403 no service.
 */
export async function authenticateAuthorization(
  authorization: string | undefined,
  lookup: AuthLookup = productionLookup,
): Promise<AuthData> {
  const token = extractBearerToken(authorization);
  if (!token) {
    throw APIError.unauthenticated("Autenticação necessária.").withDetails({
      reason: ErrorReason.AUTHENTICATION_REQUIRED,
    });
  }

  const claims = await lookup.verifyAccessToken(token);
  if (!claims) {
    throw APIError.unauthenticated("Token de acesso inválido ou expirado.").withDetails({
      reason: ErrorReason.INVALID_ACCESS_TOKEN,
    });
  }

  const session = await lookup.findActiveSession(claims.sessionId);
  if (!session || session.userId !== claims.subject) {
    throw APIError.unauthenticated("Sessão inválida ou expirada.").withDetails({ reason: ErrorReason.SESSION_INVALID });
  }

  const user = await lookup.findUserAuthState(claims.subject);
  if (!user || user.status !== AccountStatus.ACTIVE) {
    throw APIError.unauthenticated("Conta indisponível.").withDetails({ reason: ErrorReason.ACCOUNT_UNAVAILABLE });
  }

  const roles = await lookup.findRoles(claims.subject);

  return { userID: claims.subject, sessionId: claims.sessionId, roles };
}

/**
 * Tradução segura de falhas do AuthHandler. Não registra token, SQL ou parâmetros.
 */
export function translateAuthFailure(error: unknown): never {
  if (error instanceof APIError) throw error;

  if (isDatabaseUnavailable(error)) {
    log.error("Banco de dados indisponível ao validar autenticação.", {
      errorName: error instanceof Error ? error.name : "unknown",
    });
    throw APIError.unavailable("Serviço temporariamente indisponível.").withDetails({
      reason: ErrorReason.SERVICE_UNAVAILABLE,
    });
  }

  log.error("Falha inesperada ao validar autenticação.", {
    errorName: error instanceof Error ? error.name : "unknown",
  });
  throw APIError.internal("Falha ao validar autenticação.");
}

/**
 * AuthHandler oficial do Encore.
 *
 * PostgreSQL é a fonte de verdade: além de validar o JWT, confirma a sessão
 * (não revogada/expirada), o estado da conta e os papéis EFETIVOS em user_roles.
 * Não há cache de autenticação — consistência e revogação imediata primeiro.
 */
export const auth = authHandler<AuthParams, AuthData>(async params => {
  try {
    return await authenticateAuthorization(params.authorization);
  } catch (error) {
    return translateAuthFailure(error);
  }
});

export const gateway = new Gateway({ authHandler: auth });
