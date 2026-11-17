import { describe, expect, it } from "bun:test";
import { APIError, ErrCode, HandlerResponse, MiddlewareRequest, type Next } from "encore.dev/api";
import type { AuthData } from "@/auth/auth.types";
import { ErrorReason } from "@/constants/error-reasons";
import { DriverStatus } from "@/domain/driver/driver.types";
import { AuthRole } from "@/domain/identity/identity.types";
import {
  DRIVER_OPERATIONAL_POLICY,
  createDriverOperationalMiddleware,
} from "@/middlewares/driver-operational.middleware";

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

describe("DriverOperationalMiddleware — metadados", () => {
  it("seleciona endpoints por auth + tag operacional", () => {
    const middleware = createDriverOperationalMiddleware(async () => DriverStatus.APPROVED);

    expect(middleware.options?.target?.auth).toBe(true);
    expect(middleware.options?.target?.tags).toEqual(["driver-operational"]);
    expect(DRIVER_OPERATIONAL_POLICY).toMatchObject({ role: AuthRole.Driver });
  });
});

describe("DriverOperationalMiddleware — autorização", () => {
  it("retorna 401 sem AuthData", async () => {
    const { next } = createNext();
    const middleware = createDriverOperationalMiddleware(
      async () => DriverStatus.APPROVED,
      undefined,
      () => null,
    );

    const error = await captureError(middleware(new MiddlewareRequest(), next));

    expect(error.code).toBe(ErrCode.Unauthenticated);
    expect(error.details).toEqual({ reason: ErrorReason.AUTHENTICATION_REQUIRED });
  });

  it("nega quem não tem papel DRIVER e não consulta o status", async () => {
    let statusCalls = 0;
    const { next, calls } = createNext();
    const middleware = createDriverOperationalMiddleware(
      async () => {
        statusCalls += 1;
        return DriverStatus.APPROVED;
      },
      undefined,
      () => authWith([AuthRole.Client]),
    );

    const error = await captureError(middleware(new MiddlewareRequest(), next));

    expect(error.code).toBe(ErrCode.PermissionDenied);
    expect(error.details).toEqual({ reason: ErrorReason.ROLE_NOT_ALLOWED });
    expect(statusCalls).toBe(0);
    expect(calls()).toBe(0);
  });

  it("nega DRIVER não aprovado em todos os status operacionais", async () => {
    for (const status of [
      DriverStatus.PENDING,
      DriverStatus.UNDER_REVIEW,
      DriverStatus.REJECTED,
      DriverStatus.SUSPENDED,
    ]) {
      const { next, calls } = createNext();
      const middleware = createDriverOperationalMiddleware(
        async () => status,
        undefined,
        () => authWith([AuthRole.Driver]),
      );

      const error = await captureError(middleware(new MiddlewareRequest(), next));

      expect(error.code).toBe(ErrCode.PermissionDenied);
      expect(error.details).toEqual({ reason: ErrorReason.DRIVER_PROFILE_UNAVAILABLE });
      expect(calls()).toBe(0);
    }
  });

  it("nega DRIVER sem perfil de motorista", async () => {
    const { next } = createNext();
    const middleware = createDriverOperationalMiddleware(
      async () => null,
      undefined,
      () => authWith([AuthRole.Driver]),
    );

    const error = await captureError(middleware(new MiddlewareRequest(), next));

    expect(error.code).toBe(ErrCode.PermissionDenied);
    expect(error.details).toEqual({ reason: ErrorReason.DRIVER_PROFILE_UNAVAILABLE });
  });

  it("permite DRIVER APPROVED e executa next uma vez", async () => {
    const { next, calls } = createNext();
    const middleware = createDriverOperationalMiddleware(
      async () => DriverStatus.APPROVED,
      undefined,
      () => authWith([AuthRole.Driver]),
    );

    const response = await middleware(new MiddlewareRequest(), next);

    expect(response.payload).toEqual({ ok: true });
    expect(calls()).toBe(1);
  });

  it("a perda de aprovação durante a sessão bloqueia a próxima operação", async () => {
    let status: DriverStatus = DriverStatus.APPROVED;
    const authData: AuthData = authWith([AuthRole.Driver]);
    const middleware = createDriverOperationalMiddleware(
      async () => status,
      undefined,
      () => authData,
    );

    await middleware(new MiddlewareRequest(), createNext().next);
    status = DriverStatus.SUSPENDED;

    const error = await captureError(middleware(new MiddlewareRequest(), createNext().next));

    expect(error.code).toBe(ErrCode.PermissionDenied);
    expect(error.details).toEqual({ reason: ErrorReason.DRIVER_PROFILE_UNAVAILABLE });
  });
});
