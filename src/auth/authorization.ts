import { APIError } from "encore.dev/api";
import { ErrorReason } from "@/constants/error-reasons";
import type { AuthRole } from "@/domain/identity/identity.types";
import type { AuthData } from "./auth.types";

export function hasRole(authData: AuthData, role: AuthRole): boolean {
  return authData.roles.includes(role);
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
