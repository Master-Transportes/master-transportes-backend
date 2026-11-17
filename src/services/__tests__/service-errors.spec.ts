import { describe, expect, it } from "bun:test";
import { APIError, ErrCode } from "encore.dev/api";
import { ErrorReason } from "@/constants/error-reasons";
import { UniqueViolationError } from "@/repositories/database-errors";
import { translatePersistenceError } from "@/services/service-errors";

function capture(run: () => never): APIError {
  try {
    run();
  } catch (error) {
    if (error instanceof APIError) return error;
    throw error;
  }

  throw new Error("Era esperado um APIError.");
}

function postgresError(code: string, constraintName?: string) {
  return Object.assign(new Error("driver error"), {
    code,
    ...(constraintName ? { constraint_name: constraintName } : {}),
  });
}

describe("translatePersistenceError", () => {
  it("traduz unicidade para 409 com reason estável e mensagem genérica", () => {
    const error = capture(() =>
      translatePersistenceError(new UniqueViolationError("users_email_lower_unique"), {
        conflictMessage: "Não foi possível concluir o cadastro.",
        conflictReason: ErrorReason.ACCOUNT_ALREADY_EXISTS,
      }),
    );

    expect(error.code).toBe(ErrCode.AlreadyExists);
    expect(error.message).toBe("Não foi possível concluir o cadastro.");
    expect(error.details).toEqual({ reason: ErrorReason.ACCOUNT_ALREADY_EXISTS });
  });

  it("não diferencia e-mail de CPF na resposta pública", () => {
    const emailError = capture(() =>
      translatePersistenceError(new UniqueViolationError("users_email_lower_unique"), {
        conflictMessage: "Não foi possível concluir o cadastro.",
        conflictReason: ErrorReason.ACCOUNT_ALREADY_EXISTS,
      }),
    );
    const cpfError = capture(() =>
      translatePersistenceError(new UniqueViolationError("users_cpf_unique"), {
        conflictMessage: "Não foi possível concluir o cadastro.",
        conflictReason: ErrorReason.ACCOUNT_ALREADY_EXISTS,
      }),
    );

    expect(emailError.message).toBe(cpfError.message);
    expect(emailError.details).toEqual(cpfError.details);
  });

  it("traduz indisponibilidade do PostgreSQL para 503", () => {
    const error = capture(() => translatePersistenceError(postgresError("08006")));

    expect(error.code).toBe(ErrCode.Unavailable);
    expect(error.details).toEqual({ reason: ErrorReason.SERVICE_UNAVAILABLE });
  });

  it("traduz CHECK violation para 400", () => {
    const error = capture(() => translatePersistenceError(postgresError("23514")));

    expect(error.code).toBe(ErrCode.InvalidArgument);
  });

  it("não converte erro desconhecido em validação, credencial ou conflito", () => {
    const error = capture(() => translatePersistenceError(new Error("falha inesperada")));

    expect(error.code).toBe(ErrCode.Internal);
  });

  it("relança APIError intencional sem alterar código/details", () => {
    const original = APIError.permissionDenied("Conta indisponível.").withDetails({
      reason: ErrorReason.ACCOUNT_UNAVAILABLE,
    });

    const error = capture(() => translatePersistenceError(original));

    expect(error).toBe(original);
    expect(error.code).toBe(ErrCode.PermissionDenied);
    expect(error.details).toEqual({ reason: ErrorReason.ACCOUNT_UNAVAILABLE });
  });
});
