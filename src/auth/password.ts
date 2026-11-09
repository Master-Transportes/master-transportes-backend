import { compare, hash } from "bcrypt";
import log from "encore.dev/log";
import { BCRYPT_COST, PASSWORD_MAX_BYTES } from "@/constants/auth";

/**
 * Gera hash bcrypt. O limite de 72 bytes do bcrypt é rejeitado aqui como
 * defesa em profundidade (a validação de entrada já garante o limite).
 */
export async function hashPassword(plainText: string): Promise<string> {
  if (Buffer.byteLength(plainText, "utf8") > PASSWORD_MAX_BYTES) {
    throw new Error("Senha excede o limite de 72 bytes do bcrypt.");
  }

  return hash(plainText, BCRYPT_COST);
}

/**
 * Compara senha em texto puro com o hash armazenado.
 * Falhas de infraestrutura são logadas sem dados sensíveis e tratadas como
 * não correspondência (nunca elevam para 401 com detalhes internos).
 */
export async function comparePassword(plainText: string, storedHash: string): Promise<boolean> {
  try {
    return await compare(plainText, storedHash);
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    log.error(`Falha ao comparar senha: ${message}`);
    return false;
  }
}
