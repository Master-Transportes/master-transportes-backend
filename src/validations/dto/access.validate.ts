import { z } from "zod";

export const SignInSchema = z.object({
  login: z.string().email("E-mail inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
});

export const RefreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token é obrigatório."),
  sessionId: z.string().min(1, "Session ID é obrigatório."),
});

export type SignInDTO = z.infer<typeof SignInSchema>;
export type RefreshDTO = z.infer<typeof RefreshSchema>;
