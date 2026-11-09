import { APIError } from "encore.dev/api";
import type { z } from "zod";

/**
 * Valida um payload com Zod e converte falhas em APIError 400 (invalid_argument).
 * Retorna o tipo de SAÍDA do schema (após transforms), nunca o tipo de entrada.
 */
export function validateOrThrow<S extends z.ZodType>(
  schema: S,
  data: unknown,
  options?: { message?: string },
): z.output<S> {
  const result = schema.safeParse(data);

  if (!result.success) {
    throw APIError.invalidArgument(options?.message ?? "Dados da requisição inválidos.").withDetails({
      errors: result.error.issues.map(issue => ({
        field: issue.path.length ? issue.path.join(".") : "root",
        message: issue.message,
      })),
    });
  }

  return result.data;
}
