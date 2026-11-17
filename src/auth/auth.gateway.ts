import { authHandler } from "encore.dev/auth";
import { Gateway } from "encore.dev/api";
import { assertAuthSecretsDistinct } from "@/config/env";
import { sessionRepository, userRepository } from "@/repositories";
import { authenticateRequest, translateAuthFailure, type AuthLookup } from "./authenticate";
import { verifyAccessToken } from "./auth";
import type { AuthData, AuthParams } from "./auth.types";

// Falha cedo (e sem expor valores) se os segredos de JWT/refresh estiverem
// ausentes, curtos ou iguais. Esse é o ponto de inicialização do AuthHandler.
assertAuthSecretsDistinct();

const lookup: AuthLookup = {
  verifyAccessToken,
  findActiveSession: sessionId => sessionRepository.findActiveById(sessionId),
  findUserAuthState: userId => userRepository.findAuthStateById(userId),
  findRoles: userId => userRepository.findRolesByUserId(userId),
};

/**
 * AuthHandler oficial do Encore.
 *
 * PostgreSQL é a fonte de verdade: além de validar o JWT, confirma a sessão
 * (não revogada/expirada), o estado da conta e os papéis EFETIVOS em user_roles.
 * Não há cache de autenticação — consistência e revogação imediata primeiro.
 */
export const auth = authHandler<AuthParams, AuthData>(async params => {
  try {
    return await authenticateRequest(params.authorization, lookup);
  } catch (error) {
    return translateAuthFailure(error);
  }
});

export const gateway = new Gateway({ authHandler: auth });
