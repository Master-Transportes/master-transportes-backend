import { APIError, middleware, type Middleware } from "encore.dev/api";
import * as auth from "~encore/auth";
import { requireAuthData, requireRole } from "@/auth/authorization";
import type { AuthData } from "@/auth/auth.types";
import { ErrorReason } from "@/constants/error-reasons";
import { DriverStatus } from "@/domain/driver/driver.types";
import { AuthRole } from "@/domain/identity/identity.types";

/**
 * Política de acesso para operações que exigem motorista APROVADO.
 *
 * Papel DRIVER não significa elegibilidade operacional: PENDING, UNDER_REVIEW,
 * REJECTED e SUSPENDED continuam sem acesso a estas operações. O middleware é
 * separado do `driver-role` e não é aplicado a `/driver/me` nem a logout.
 *
 * Convenção para uma rota operacional: declarar
 * `tags: ["driver-role", "driver-operational"]`. O primeiro mantém a
 * classificação central `driver`; o segundo exige APPROVED. O middleware
 * operacional também chama `requireRole`, então não há bypass de papel.
 */
export interface DriverOperationalPolicy {
  tag: string;
  role: AuthRole;
  deniedMessage: string;
}

export type DriverStatusGetter = (userId: string) => Promise<DriverStatus | null>;
export type AuthDataGetter = () => AuthData | null;

export const DRIVER_OPERATIONAL_POLICY: DriverOperationalPolicy = {
  tag: "driver-operational",
  role: AuthRole.Driver,
  deniedMessage: "Acesso restrito a motoristas aprovados.",
};

/**
 * O getter de status é obrigatório para manter este middleware independente do
 * Drizzle e testável com fakes. A composição real ocorre no `encore.service.ts`.
 */
export function createDriverOperationalMiddleware(
  getDriverStatus: DriverStatusGetter,
  policy: DriverOperationalPolicy = DRIVER_OPERATIONAL_POLICY,
  getAuthData: AuthDataGetter = auth.getAuthData,
): Middleware {
  return middleware({ target: { auth: true, tags: [policy.tag] } }, async (req, next) => {
    const authData = requireAuthData(getAuthData());

    requireRole(authData, policy.role, policy.deniedMessage);

    const status = await getDriverStatus(authData.userID);
    if (status !== DriverStatus.APPROVED) {
      throw APIError.permissionDenied(policy.deniedMessage).withDetails({
        reason: ErrorReason.DRIVER_PROFILE_UNAVAILABLE,
      });
    }

    return next(req);
  });
}
