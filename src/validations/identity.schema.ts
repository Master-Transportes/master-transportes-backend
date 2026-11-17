import { z } from "zod";
import { isValidBrazilianPhone, isValidCpf, normalizeCpf, normalizePhone } from "@/domain/identity/identity.utils";

/** CPF normalizado (somente dígitos) e validado pelos dígitos verificadores. */
export const cpfSchema = z.string().trim().transform(normalizeCpf).refine(isValidCpf, "CPF inválido.");

/** Telefone brasileiro normalizado (somente dígitos, sem +55). */
export const phoneSchema = z
  .string()
  .trim()
  .transform(normalizePhone)
  .refine(isValidBrazilianPhone, "Telefone inválido.");
