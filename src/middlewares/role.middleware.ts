import { APIError, middleware, type Middleware } from "encore.dev/api";
import * as auth from "~encore/auth";
import { requireRole } from "@/auth/authorization";
import type { AuthData } from "@/auth/auth.types";
import { ErrorReason } from "@/constants/error-reasons";
import { AuthRole } from "@/domain/identity/identity.types";

/**
 * Middleware de autorização por papel.
 *
 * O Encore aplica o middleware apenas aos endpoints que combinam com o `target`.
 * `tags` usa OR para selecionar endpoints; por isso cada middleware carrega uma
 * única tag de papel. A ausência de tag em um endpoint não pode ser compensada
 * aqui — é justamente o que o teste de política de endpoints verifica.
 */
export interface RoleMiddlewarePolicy {
  tag: string;
  role: AuthRole;
  deniedMessage: string;
}

export const CLIENT_ROLE_POLICY: RoleMiddlewarePolicy = {
  tag: "client-role",
  role: AuthRole.Client,
  deniedMessage: "Acesso restrito a passageiros.",
};

export const DRIVER_ROLE_POLICY: RoleMiddlewarePolicy = {
  tag: "driver-role",
  role: AuthRole.Driver,
  deniedMessage: "Acesso restrito a motoristas.",
};

/** Ponto de injeção usado apenas em testes; em produção lê o AuthData do Encore. */
export type AuthDataGetter = () => AuthData | null;

export function createRoleMiddleware(
  policy: RoleMiddlewarePolicy,
  getAuthData: AuthDataGetter = auth.getAuthData,
): Middleware {
  return middleware({ target: { auth: true, tags: [policy.tag] } }, async (req, next) => {
    const authData = getAuthData();

    if (!authData) {
      throw APIError.unauthenticated("Autenticação necessária.").withDetails({
        reason: ErrorReason.AUTHENTICATION_REQUIRED,
      });
    }

    requireRole(authData, policy.role, policy.deniedMessage);

    return next(req);
  });
}

/**
 * Logout fica deliberadamente sem tag de papel: uma sessão válida deve poder ser
 * encerrada mesmo após a remoção do papel CLIENT ou DRIVER.
 */
export const ClientRoleMiddleware = createRoleMiddleware(CLIENT_ROLE_POLICY);
export const DriverRoleMiddleware = createRoleMiddleware(DRIVER_ROLE_POLICY);
