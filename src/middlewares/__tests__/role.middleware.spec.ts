import { describe, expect, it } from "bun:test";
import { APIError, ErrCode, HandlerResponse, MiddlewareRequest, type Next } from "encore.dev/api";
import type { AuthData } from "@/auth/auth.types";
import { ErrorReason } from "@/constants/error-reasons";
import { AuthRole } from "@/domain/identity/identity.types";
import {
  CLIENT_ROLE_POLICY,
  DRIVER_ROLE_POLICY,
  ClientRoleMiddleware,
  DriverRoleMiddleware,
  createRoleMiddleware,
  type RoleMiddlewarePolicy,
} from "@/middlewares/role.middleware";

function authWith(roles: AuthRole[]): AuthData {
  return { userID: "user-1", sessionId: "session-1", roles };
}

function createNext() {
  let calls = 0;
  const next: Next = async () => {
    calls += 1;
    return new HandlerResponse({ ok: true });
  };

  return { next, calls: () => calls };
}

async function captureError(promise: Promise<unknown>): Promise<APIError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof APIError) return error;
    throw error;
  }

  throw new Error("A chamada deveria ter sido rejeitada.");
}

function middlewareFor(policy: RoleMiddlewarePolicy, authData: AuthData | null) {
  return createRoleMiddleware(policy, () => authData);
}

describe("Role middleware — metadados", () => {
  it("seleciona endpoints por auth + tag, sem depender de prefixo de URL", () => {
    for (const middleware of [ClientRoleMiddleware, DriverRoleMiddleware]) {
      expect(middleware.options?.target?.auth).toBe(true);
      expect(Object.keys(middleware.options?.target ?? {}).sort()).toEqual(["auth", "tags"]);
    }

    expect(CLIENT_ROLE_POLICY).toMatchObject({ tag: "client-role", role: AuthRole.Client });
    expect(DRIVER_ROLE_POLICY).toMatchObject({ tag: "driver-role", role: AuthRole.Driver });
    expect(ClientRoleMiddleware.options?.target?.tags).toEqual(["client-role"]);
    expect(DriverRoleMiddleware.options?.target?.tags).toEqual(["driver-role"]);
  });
});

describe("Role middleware — autenticação", () => {
  it("retorna 401 com AUTHENTICATION_REQUIRED quando não há AuthData", async () => {
    for (const policy of [CLIENT_ROLE_POLICY, DRIVER_ROLE_POLICY]) {
      const { next, calls } = createNext();

      const error = await captureError(middlewareFor(policy, null)(new MiddlewareRequest(), next));

      expect(error.code).toBe(ErrCode.Unauthenticated);
      expect(error.details).toEqual({ reason: ErrorReason.AUTHENTICATION_REQUIRED });
      expect(calls()).toBe(0);
    }
  });
});

describe("Role middleware — autorização", () => {
  it("permite CLIENT em endpoint de cliente e executa next exatamente uma vez", async () => {
    const { next, calls } = createNext();

    const response = await middlewareFor(CLIENT_ROLE_POLICY, authWith([AuthRole.Client]))(
      new MiddlewareRequest(),
      next,
    );

    expect(response.payload).toEqual({ ok: true });
    expect(calls()).toBe(1);
  });

  it("permite DRIVER em endpoint de motorista", async () => {
    const { next, calls } = createNext();

    await middlewareFor(DRIVER_ROLE_POLICY, authWith([AuthRole.Driver]))(new MiddlewareRequest(), next);

    expect(calls()).toBe(1);
  });

  it("nega CLIENT em endpoint de motorista com 403 e não executa next", async () => {
    const { next, calls } = createNext();

    const error = await captureError(
      middlewareFor(DRIVER_ROLE_POLICY, authWith([AuthRole.Client]))(new MiddlewareRequest(), next),
    );

    expect(error.code).toBe(ErrCode.PermissionDenied);
    expect(error.message).toBe(DRIVER_ROLE_POLICY.deniedMessage);
    expect(error.details).toEqual({ reason: ErrorReason.ROLE_NOT_ALLOWED });
    expect(calls()).toBe(0);
  });

  it("nega DRIVER em endpoint de cliente com 403 e não executa next", async () => {
    const { next, calls } = createNext();

    const error = await captureError(
      middlewareFor(CLIENT_ROLE_POLICY, authWith([AuthRole.Driver]))(new MiddlewareRequest(), next),
    );

    expect(error.code).toBe(ErrCode.PermissionDenied);
    expect(error.message).toBe(CLIENT_ROLE_POLICY.deniedMessage);
    expect(error.details).toEqual({ reason: ErrorReason.ROLE_NOT_ALLOWED });
    expect(calls()).toBe(0);
  });

  it("permite conta com CLIENT + DRIVER nos dois endpoints", async () => {
    const both = authWith([AuthRole.Client, AuthRole.Driver]);

    const clientNext = createNext();
    const driverNext = createNext();

    await middlewareFor(CLIENT_ROLE_POLICY, both)(new MiddlewareRequest(), clientNext.next);
    await middlewareFor(DRIVER_ROLE_POLICY, both)(new MiddlewareRequest(), driverNext.next);

    expect(clientNext.calls()).toBe(1);
    expect(driverNext.calls()).toBe(1);
  });

  it("nega o acesso quando o papel deixou de existir após o login", async () => {
    const { next, calls } = createNext();

    const error = await captureError(middlewareFor(CLIENT_ROLE_POLICY, authWith([]))(new MiddlewareRequest(), next));

    expect(error.code).toBe(ErrCode.PermissionDenied);
    expect(error.details).toEqual({ reason: ErrorReason.ROLE_NOT_ALLOWED });
    expect(calls()).toBe(0);
  });

  it("não concede acesso por ADMIN/SUPPORT sem o papel exigido", async () => {
    for (const role of [AuthRole.Admin, AuthRole.Support]) {
      const { next, calls } = createNext();

      const error = await captureError(
        middlewareFor(CLIENT_ROLE_POLICY, authWith([role]))(new MiddlewareRequest(), next),
      );

      expect(error.code).toBe(ErrCode.PermissionDenied);
      expect(calls()).toBe(0);
    }
  });
});
