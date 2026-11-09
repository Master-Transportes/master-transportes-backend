import { describe, expect, it } from "bun:test";
import {
  findPostgresError,
  isCheckViolation,
  isDatabaseUnavailable,
  toUniqueViolationError,
  UniqueViolationError,
} from "@/repositories/database-errors";

/** Simula o wrapper do Drizzle (que carrega SQL/params e o erro real em cause). */
function wrappedError(cause: unknown): Error {
  return Object.assign(new Error('Failed query: insert into "users" (...) values (...) params: ...'), {
    query: 'insert into "users" (...) values (...)',
    params: ["$2b$12$hash-sensivel"],
    cause,
  });
}

function postgresError(code: string, constraintName?: string): Error {
  return Object.assign(new Error(`postgres error ${code}`), {
    code,
    ...(constraintName ? { constraint_name: constraintName } : {}),
  });
}

describe("database-errors — desembrulho da causa do Drizzle", () => {
  it("detecta violação de unicidade dentro do DrizzleQueryError", () => {
    const error = wrappedError(postgresError("23505", "users_email_lower_unique"));

    const violation = toUniqueViolationError(error);

    expect(violation).toBeInstanceOf(UniqueViolationError);
    expect(violation?.constraintName).toBe("users_email_lower_unique");
  });

  it("detecta violação de unicidade aninhada em mais de um wrapper", () => {
    const error = wrappedError(wrappedError(postgresError("23505", "users_cpf_unique")));

    expect(toUniqueViolationError(error)?.constraintName).toBe("users_cpf_unique");
  });

  it("continua detectando erro direto (sem wrapper)", () => {
    const violation = toUniqueViolationError(postgresError("23505", "users_email_lower_unique"));

    expect(violation?.constraintName).toBe("users_email_lower_unique");
  });

  it("repassa UniqueViolationError já tipado", () => {
    const original = new UniqueViolationError("users_cpf_unique");

    expect(toUniqueViolationError(original)).toBe(original);
  });

  it("detecta banco indisponível dentro do wrapper", () => {
    expect(isDatabaseUnavailable(wrappedError(postgresError("ECONNREFUSED")))).toBe(true);
    expect(isDatabaseUnavailable(wrappedError(postgresError("57P01")))).toBe(true);
  });

  it("detecta CHECK violation dentro do wrapper", () => {
    expect(isCheckViolation(wrappedError(postgresError("23514")))).toBe(true);
  });

  it("não classifica erros comuns como banco/unicidade", () => {
    const generic = new Error("falha qualquer");

    expect(findPostgresError(generic)).toBeNull();
    expect(toUniqueViolationError(generic)).toBeNull();
    expect(isDatabaseUnavailable(generic)).toBe(false);
    expect(isCheckViolation(generic)).toBe(false);
  });
});
