import { APIError, middleware } from "encore.dev/api";
import * as auth from "~encore/auth";
import { ErrorReason } from "@/constants/error-reasons";
import { AuthRole } from "@/domain/identity/identity.types";

/**
 * Autorização de motorista baseada nos papéis efetivos carregados pelo
 * AuthHandler. O `target` restringe o middleware aos endpoints autenticados
 * marcados com a tag `driver-role`.
 *
 * Logout fica deliberadamente sem essa tag: uma sessão válida deve poder ser
 * encerrada mesmo após a remoção do papel DRIVER.
 */
export const DriverRoleMiddleware = middleware({ target: { auth: true, tags: ["driver-role"] } }, async (req, next) => {
  const authData = auth.getAuthData();

  if (!authData) {
    throw APIError.unauthenticated("Autenticação necessária.").withDetails({
      reason: ErrorReason.AUTHENTICATION_REQUIRED,
    });
  }

  if (!authData.roles.includes(AuthRole.Driver)) {
    throw APIError.permissionDenied("Acesso restrito a motoristas.").withDetails({
      reason: ErrorReason.ROLE_NOT_ALLOWED,
    });
  }

  return next(req);
});
