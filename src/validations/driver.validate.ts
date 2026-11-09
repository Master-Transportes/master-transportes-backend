import { z } from "zod";
import { PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH } from "@/constants/auth";
import { isValidBrazilianPhone, isValidCpf, normalizeCpf, normalizePhone } from "@/domain/identity/identity.utils";

const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`)
  .max(72, "A senha deve ter no máximo 72 caracteres.")
  .refine(value => Buffer.byteLength(value, "utf8") <= PASSWORD_MAX_BYTES, "A senha excede o limite de 72 bytes.");

/**
 * Cadastro público de motorista. CPF e telefone são obrigatórios nesta etapa.
 * Papéis, status de conta e aprovação nunca são aceitos no payload.
 */
export const DriverRegisterSchema = z.strictObject({
  fullName: z.string().trim().min(2, "Nome completo é obrigatório.").max(150, "Nome completo é muito longo."),
  email: z.string().trim().toLowerCase().max(254, "E-mail inválido.").email("E-mail inválido."),
  password: passwordSchema,
  phone: z.string().trim().transform(normalizePhone).refine(isValidBrazilianPhone, "Telefone inválido."),
  cpf: z.string().trim().transform(normalizeCpf).refine(isValidCpf, "CPF inválido."),
});
