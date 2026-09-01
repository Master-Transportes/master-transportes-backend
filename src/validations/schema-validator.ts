import { APIError } from "encore.dev/api";
import z from "zod";

export function validateOrThrow<S extends z.ZodTypeAny>(
  schema: S,
  data: z.input<S>,
  options?: { message?: string },
): z.output<S> {
  const result = schema.safeParse(data);

  if (!result.success) {
    throw APIError.invalidArgument(options?.message ?? "Corpo da requisição inválido.").withDetails({
      errors: result.error.issues.map(i => ({
        field: i.path.length ? i.path.join(".") : "root",
        message: i.message,
      })),
    });
  }

  return result.data;
}
