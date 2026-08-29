import { z } from "zod";

export const SignInSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
});

export const RefreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token é obrigatório."),
});
