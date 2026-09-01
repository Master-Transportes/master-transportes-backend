import { z } from "zod";

export const RegisterUserSchema = z
  .object({
    fullName: z.string().min(2, "Nome completo é obrigatório."),
    email: z.string().email("E-mail inválido."),
    cpf: z.string().min(11, "CPF deve ter 11 dígitos.").max(11, "CPF deve ter 11 dígitos.").optional(),
    cnpj: z.string().min(14, "CNPJ deve ter 14 dígitos.").max(14, "CNPJ deve ter 14 dígitos.").optional(),
    password: z.string().min(6, "A senha deve ter pelo menos 6 caracteres."),
    confirmPassword: z.string().min(6, "Confirmação de senha é obrigatória."),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: "Senhas não conferem.",
    path: ["confirmPassword"],
  })
  .refine(data => data.cpf || data.cnpj, {
    message: "Informe CPF ou CNPJ.",
    path: ["cpf"],
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
  origin: z.object({
    name: z.string().min(1),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  destination: z.object({
    name: z.string().min(1),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
});

export const ListRidesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const CancelRideSchema = z.object({
  rideId: z.string().uuid(),
});
