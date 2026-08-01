import { z } from "zod";

export const RegisterDriverSchema = z
  .object({
    fullName: z.string().min(2, "Nome completo é obrigatório."),
    email: z.string().email("E-mail inválido."),
    password: z.string().min(6, "A senha deve ter pelo menos 6 caracteres."),
    confirmPassword: z.string().min(6, "Confirmação de senha é obrigatória."),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: "Senhas não conferem.",
    path: ["confirmPassword"],
  });

export const UpdateDriverProfileSchema = z.object({
  fullName: z.string().min(2).optional(),
  email: z.string().email("E-mail inválido.").optional(),
});

export const ChangeDriverPasswordSchema = z.object({
  currentPassword: z.string().min(1, "Senha atual é obrigatória."),
  newPassword: z.string().min(6, "A nova senha deve ter pelo menos 6 caracteres."),
});

export const UpdateDriverLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const AcceptOfferSchema = z.object({
  rideId: z.string().uuid(),
  offerId: z.string().uuid(),
});

export const RejectOfferSchema = z.object({
  rideId: z.string().uuid(),
  offerId: z.string().uuid(),
});

export const CompleteRideSchema = z.object({
  rideId: z.string().uuid(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const CancelRideSchema = z.object({
  rideId: z.string().uuid(),
});
