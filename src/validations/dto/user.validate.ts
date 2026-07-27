import { z } from "zod";

export const RegisterUserSchema = z.object({
  fullName: z.string().min(2, "Nome completo é obrigatório."),
  email: z.string().email("E-mail inválido."),
  password: z.string().min(6, "A senha deve ter pelo menos 6 caracteres."),
});

export const UpdateProfileSchema = z.object({
  fullName: z.string().min(2).optional(),
  email: z.string().email("E-mail inválido.").optional(),
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Senha atual é obrigatória."),
  newPassword: z.string().min(6, "A nova senha deve ter pelo menos 6 caracteres."),
});

export const RequestRideSchema = z.object({
  pickupLat: z.number().min(-90).max(90),
  pickupLng: z.number().min(-180).max(180),
  dropoffLat: z.number().min(-90).max(90),
  dropoffLng: z.number().min(-180).max(180),
});
