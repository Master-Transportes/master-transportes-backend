export const POSTGRES_ERRORS = {
  UNIQUE_VIOLATION: "23505",
} as const;

export function isPgUniqueViolation(error: unknown): boolean {
  const err = error as { cause?: { code?: string }; code?: string } | null;
  const code = err?.cause?.code ?? err?.code;
  return code === POSTGRES_ERRORS.UNIQUE_VIOLATION;
}
