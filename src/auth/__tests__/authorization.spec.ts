import { describe, expect, it } from "bun:test";
import { APIError, ErrCode } from "encore.dev/api";
import { AuthRole } from "@/domain/identity/identity.types";
import { hasRole, requireRole } from "@/auth/authorization";
import type { AuthData } from "@/auth/auth.types";

function authWith(roles: AuthRole[]): AuthData {
  return { userID: "user-1", sessionId: "session-1", roles };
}

function catchError(run: () => void): APIError | null {
  try {
    run();
    return null;
  } catch (error) {
    return error instanceof APIError ? error : null;
  }
}

describe("requireRole", () => {
  it("permite quando o papel efetivo está presente", () => {
    expect(() => requireRole(authWith([AuthRole.Client]), AuthRole.Client)).not.toThrow();
    expect(() => requireRole(authWith([AuthRole.Driver]), AuthRole.Driver)).not.toThrow();
  });

  it("nega com 403 quando falta o papel", () => {
    const error = catchError(() => requireRole(authWith([AuthRole.Client]), AuthRole.Driver));

    expect(error).toBeInstanceOf(APIError);
    expect(error?.code).toBe(ErrCode.PermissionDenied);
  });

  it("respeita múltiplos papéis na mesma conta (CLIENT + DRIVER)", () => {
    const both = authWith([AuthRole.Client, AuthRole.Driver]);

    expect(hasRole(both, AuthRole.Client)).toBe(true);
    expect(hasRole(both, AuthRole.Driver)).toBe(true);
    expect(() => requireRole(both, AuthRole.Client)).not.toThrow();
    expect(() => requireRole(both, AuthRole.Driver)).not.toThrow();
  });

  it("não concede ADMIN/SUPPORT por padrão a contas comuns", () => {
    const client = authWith([AuthRole.Client]);

    expect(hasRole(client, AuthRole.Admin)).toBe(false);
    expect(hasRole(client, AuthRole.Support)).toBe(false);
    expect(catchError(() => requireRole(client, AuthRole.Admin))?.code).toBe(ErrCode.PermissionDenied);
  });
});
