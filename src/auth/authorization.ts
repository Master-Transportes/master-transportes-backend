import { APIError } from "encore.dev/api";
import { ErrorReason } from "@/constants/error-reasons";
import type { AuthRole } from "@/domain/identity/identity.types";
import type { AuthData } from "./auth.types";

export function hasRole(authData: AuthData, role: AuthRole): boolean {
  return authData.roles.includes(role);
}

/**
 * Garante que o contexto autenticado existe antes de usar `userID`/`sessionId`.
 * Substitui o non-null assertion (`!`) por um 401 explícito e testável.
 */
export function requireAuthData(authData: AuthData | null | undefined): AuthData {
  if (!authData) {
    throw APIError.unauthenticated("Autenticação necessária.").withDetails({
      reason: ErrorReason.AUTHENTICATION_REQUIRED,
    });
  }
  return authData;
}

const DEFAULT_DENIED_MESSAGE = "Você não tem permissão para acessar este recurso.";

/**
 * Autorização por papel baseada nos papéis EFETIVOS carregados pelo AuthHandler
 * (user_roles no PostgreSQL), nunca em claims antigas do JWT.
 *
 * 403 quando autenticado sem permissão; ausência de autenticação já é 401
 * tratada pelo Encore antes do endpoint.
 */
export function requireRole(authData: AuthData, role: AuthRole, deniedMessage: string = DEFAULT_DENIED_MESSAGE): void {
  if (!hasRole(authData, role)) {
    throw APIError.permissionDenied(deniedMessage).withDetails({ reason: ErrorReason.ROLE_NOT_ALLOWED });
  }
}
