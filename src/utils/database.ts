import postgres from "postgres";

export const POSTGRES_ERRORS = {
  UNIQUE_VIOLATION: "23505",
} as const;

function findPostgresError(error: unknown): postgres.PostgresError | null {
  if (error instanceof postgres.PostgresError) return error;
  if (error instanceof Error && error.cause) return findPostgresError(error.cause);
  return null;
}

export function isPgUniqueViolation(error: unknown): boolean {
  const pgError = findPostgresError(error);
  return pgError !== null && pgError.code === POSTGRES_ERRORS.UNIQUE_VIOLATION;
}
