import { z } from "zod";
import { PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH } from "@/constants/auth";

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

/**
 * Política de criação de senha (cadastro).
 * O bcrypt considera no máximo 72 bytes; validar bytes evita truncamento silencioso
 * em senhas com caracteres multibyte.
 */
export const passwordCreationSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`)
  .refine(value => byteLength(value) <= PASSWORD_MAX_BYTES, "A senha excede o limite de 72 bytes.");

/**
 * Política de autenticação (login).
 * Deliberadamente NÃO impõe o mínimo de 8 caracteres: contas antigas podem ter
 * senhas criadas sob outra política. O limite de bytes, porém, precisa ser o mesmo
 * do bcrypt para não aceitar sufixos que o algoritmo ignora.
 */
export const passwordLoginSchema = z
  .string()
  .min(1, "Senha é obrigatória.")
  .max(200, "Senha inválida.")
  .refine(value => byteLength(value) <= PASSWORD_MAX_BYTES, "Senha inválida.");
