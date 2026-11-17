import { describe, expect, it } from "bun:test";
import { APIError, ErrCode } from "encore.dev/api";
import { ErrorReason } from "@/constants/error-reasons";
import { AccountStatus, AuthRole } from "@/domain/identity/identity.types";
import { authenticateRequest, extractBearerToken, translateAuthFailure, type AuthLookup } from "@/auth/authenticate";

const CLAIMS = { subject: "user-1", sessionId: "session-1", tokenId: "token-1" };

function lookup(overrides: Partial<AuthLookup> = {}): AuthLookup {
  return {
    verifyAccessToken: async () => CLAIMS,
    findActiveSession: async () => ({ id: "session-1", userId: "user-1" }),
    findUserAuthState: async () => ({ id: "user-1", status: AccountStatus.ACTIVE }),
    findRoles: async () => [AuthRole.Client],
    ...overrides,
  };
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

describe("extractBearerToken", () => {
  it("aceita Bearer case-insensitive e rejeita esquemas inválidos", () => {
    expect(extractBearerToken("Bearer abc")).toBe("abc");
    expect(extractBearerToken("bearer abc")).toBe("abc");
    expect(extractBearerToken("Basic abc")).toBeNull();
    expect(extractBearerToken(undefined)).toBeNull();
    expect(extractBearerToken("Bearer")).toBeNull();
  });
});

describe("authenticateRequest", () => {
  it("retorna AuthData com papéis efetivos do banco", async () => {
    const authData = await authenticateRequest(
      "Bearer token",
      lookup({ findRoles: async () => [AuthRole.Client, AuthRole.Driver] }),
    );

    expect(authData).toEqual({ userID: "user-1", sessionId: "session-1", roles: [AuthRole.Client, AuthRole.Driver] });
  });

  it("retorna 401 quando não há token", async () => {
    const error = await captureError(authenticateRequest(undefined, lookup()));

    expect(error.code).toBe(ErrCode.Unauthenticated);
    expect(error.details).toEqual({ reason: ErrorReason.AUTHENTICATION_REQUIRED });
  });

  it("retorna 401 quando o JWT é inválido", async () => {
    const error = await captureError(
      authenticateRequest("Bearer invalido", lookup({ verifyAccessToken: async () => null })),
    );

    expect(error.code).toBe(ErrCode.Unauthenticated);
    expect(error.details).toEqual({ reason: ErrorReason.INVALID_ACCESS_TOKEN });
  });

  it("retorna 401 quando a sessão não existe, pertence a outro usuário ou está revogada", async () => {
    for (const findActiveSession of [async () => null, async () => ({ id: "session-1", userId: "outro-usuario" })]) {
      const error = await captureError(authenticateRequest("Bearer token", lookup({ findActiveSession })));

      expect(error.code).toBe(ErrCode.Unauthenticated);
      expect(error.details).toEqual({ reason: ErrorReason.SESSION_INVALID });
    }
  });

  it("retorna 401 quando a conta não existe ou não está ativa", async () => {
    for (const findUserAuthState of [
      async () => null,
      async () => ({ id: "user-1", status: AccountStatus.BANNED }),
      async () => ({ id: "user-1", status: AccountStatus.INACTIVE }),
    ]) {
      const error = await captureError(authenticateRequest("Bearer token", lookup({ findUserAuthState })));

      expect(error.code).toBe(ErrCode.Unauthenticated);
      expect(error.details).toEqual({ reason: ErrorReason.ACCOUNT_UNAVAILABLE });
    }
  });

  it("devolve papéis vazios quando o papel foi removido; a decisão de acesso fica no middleware", async () => {
    const authData = await authenticateRequest("Bearer token", lookup({ findRoles: async () => [] }));

    expect(authData.roles).toEqual([]);
  });
});

describe("translateAuthFailure", () => {
  it("relança APIError intencional sem alterar código/details", () => {
    const original = APIError.unauthenticated("x").withDetails({ reason: ErrorReason.INVALID_ACCESS_TOKEN });

    expect(() => translateAuthFailure(original)).toThrow(original);
  });

  it("traduz banco indisponível para 503", () => {
    let captured: APIError | null = null;
    try {
      translateAuthFailure(Object.assign(new Error("db"), { code: "08006" }));
    } catch (error) {
      captured = error instanceof APIError ? error : null;
    }

    expect(captured?.code).toBe(ErrCode.Unavailable);
    expect(captured?.details).toEqual({ reason: ErrorReason.SERVICE_UNAVAILABLE });
  });

  it("traduz erro inesperado para 500 sem detalhes internos", () => {
    let captured: APIError | null = null;
    try {
      translateAuthFailure(new Error("SQL verboso"));
    } catch (error) {
      captured = error instanceof APIError ? error : null;
    }

    expect(captured?.code).toBe(ErrCode.Internal);
    expect(captured?.message).toBe("Falha ao validar autenticação.");
  });
});
