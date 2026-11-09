/**
 * Tradução de erros do PostgreSQL/postgres.js para erros internos tipados.
 * Não importa nada de HTTP/Encore — a tradução para APIError é feita na
 * camada de service (services/service-errors.ts).
 *
 * IMPORTANTE: o Drizzle embrulha erros do driver em `DrizzleQueryError`
 * ("Failed query: ..."), com o erro real em `error.cause`. Por isso a busca
 * percorre a cadeia de causas.
 */

const UNIQUE_VIOLATION_CODE = "23505";
const CHECK_VIOLATION_CODE = "23514";

const DATABASE_UNAVAILABLE_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "ENETUNREACH",
  "08000",
  "08001",
  "08003",
  "08006",
  "57P01",
  "57P02",
  "57P03",
  "53300",
]);

const MAX_CAUSE_DEPTH = 6;

interface PostgresErrorLike {
  code: string;
  constraint_name?: string;
  message?: string;
}

export class UniqueViolationError extends Error {
  constructor(
    readonly constraintName: string | undefined,
    options?: { cause?: unknown },
  ) {
    super("Violação de unicidade no banco de dados.");
    this.name = "UniqueViolationError";
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

function isPostgresErrorLike(value: unknown): value is PostgresErrorLike {
  if (typeof value !== "object" || value === null) return false;
  if (!("code" in value) || typeof value.code !== "string") return false;
  if ("constraint_name" in value && value.constraint_name !== undefined && typeof value.constraint_name !== "string") {
    return false;
  }
  return true;
}

/** Procura o erro nativo do PostgreSQL na cadeia de `cause`. */
export function findPostgresError(error: unknown): PostgresErrorLike | null {
  let current: unknown = error;

  for (let depth = 0; depth <= MAX_CAUSE_DEPTH; depth += 1) {
    if (isPostgresErrorLike(current)) return current;
    if (typeof current !== "object" || current === null) return null;
    if (!("cause" in current)) return null;
    current = current.cause;
  }

  return null;
}

export function toUniqueViolationError(error: unknown): UniqueViolationError | null {
  if (error instanceof UniqueViolationError) return error;

  const databaseError = findPostgresError(error);
  if (!databaseError || databaseError.code !== UNIQUE_VIOLATION_CODE) return null;

  return new UniqueViolationError(databaseError.constraint_name, { cause: error });
}

export function isCheckViolation(error: unknown): boolean {
  return findPostgresError(error)?.code === CHECK_VIOLATION_CODE;
}

export function isDatabaseUnavailable(error: unknown): boolean {
  const databaseError = findPostgresError(error);
  return databaseError !== null && DATABASE_UNAVAILABLE_CODES.has(databaseError.code);
}
