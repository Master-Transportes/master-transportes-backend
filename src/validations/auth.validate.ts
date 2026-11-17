import { z } from "zod";
import { passwordLoginSchema } from "./password.schema";

export const LoginSchema = z.strictObject({
  email: z.string().trim().toLowerCase().max(254, "E-mail inválido.").email("E-mail inválido."),
  password: passwordLoginSchema,
});

export const RefreshSchema = z.strictObject({
  refreshToken: z.string().min(1, "Refresh token é obrigatório.").max(512, "Refresh token inválido."),
});
