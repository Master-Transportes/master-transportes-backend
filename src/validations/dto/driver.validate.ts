import { z } from "zod";

export const RegisterDriverSchema = z
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

export const ListDriverRidesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const CancelRideSchema = z.object({
  rideId: z.string().uuid(),
});

const PHONE_REGEX = /^\+?[1-9]\d{7,14}$/;

export const PixKeySchema = z
  .object({
    pixKey: z.string().min(1, "Chave Pix é obrigatória."),
    pixKeyType: z.enum(["CPF", "CNPJ", "EMAIL", "PHONE", "EVP"], {
      error: "Tipo de chave Pix inválido.",
    }),
  })
  .superRefine((data, ctx) => {
    const key = data.pixKey.trim();
    switch (data.pixKeyType) {
      case "CPF":
        if (!/^\d{11}$/.test(key)) {
          ctx.addIssue({ code: "custom", message: "CPF deve conter 11 dígitos.", path: ["pixKey"] });
        }
        break;
      case "CNPJ":
        if (!/^\d{14}$/.test(key)) {
          ctx.addIssue({ code: "custom", message: "CNPJ deve conter 14 dígitos.", path: ["pixKey"] });
        }
        break;
      case "EMAIL":
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) {
          ctx.addIssue({ code: "custom", message: "E-mail inválido.", path: ["pixKey"] });
        }
        break;
      case "PHONE":
        if (!PHONE_REGEX.test(key)) {
          ctx.addIssue({ code: "custom", message: "Telefone inválido.", path: ["pixKey"] });
        }
        break;
      case "EVP":
        if (!z.string().uuid().safeParse(key).success) {
          ctx.addIssue({ code: "custom", message: "Chave aleatória (EVP) inválida.", path: ["pixKey"] });
        }
        break;
    }
  });
