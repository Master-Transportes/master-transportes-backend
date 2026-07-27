import { z } from "zod";

export const RegisterDriverSchema = z.object({
  fullName: z.string().min(2, "Nome completo é obrigatório."),
  email: z.string().email("E-mail inválido."),
  password: z.string().min(6, "A senha deve ter pelo menos 6 caracteres."),
});

export const UpdateDriverProfileSchema = z.object({
  fullName: z.string().min(2).optional(),
  email: z.string().email("E-mail inválido.").optional(),
});

export const ChangeDriverPasswordSchema = z.object({
  currentPassword: z.string().min(1, "Senha atual é obrigatória."),
  newPassword: z.string().min(6, "A nova senha deve ter pelo menos 6 caracteres."),
});

