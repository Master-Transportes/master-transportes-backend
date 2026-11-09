import { APIError } from "encore.dev/api";
import type { AuthRole } from "@/domain/identity/identity.types";
import type { AuthData } from "./auth.types";

export function hasRole(authData: AuthData, role: AuthRole): boolean {
  return authData.roles.includes(role);
}

/**
 * Autorização por papel baseada nos papéis EFETIVOS carregados pelo AuthHandler
 * (user_roles no PostgreSQL), nunca em claims antigas do JWT.
 *
 * 403 quando autenticado sem permissão; ausência de autenticação já é 401
 * tratada pelo Encore antes do endpoint.
 */
export function requireRole(authData: AuthData, role: AuthRole): void {
  if (!hasRole(authData, role)) {
    throw APIError.permissionDenied("Você não tem permissão para acessar este recurso.");
  }
}
