import { z } from "zod";

export const LoginSchema = z.strictObject({
  email: z.string().trim().toLowerCase().max(254, "E-mail inválido.").email("E-mail inválido."),
  password: z.string().min(1, "Senha é obrigatória.").max(200, "Senha inválida."),
});

export const RefreshSchema = z.strictObject({
  refreshToken: z.string().min(1, "Refresh token é obrigatório.").max(512, "Refresh token inválido."),
});
