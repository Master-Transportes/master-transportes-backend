import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import {
  findPostgresError,
  isCheckViolation,
  isDatabaseUnavailable,
  toUniqueViolationError,
} from "@/repositories/database-errors";

interface PersistenceErrorMessages {
  email?: string;
  cpf?: string;
  fallbackConflict?: string;
  fallbackInternal?: string;
}

/** Detecta o wrapper do Drizzle sem expor seu conteúdo (contém SQL + params). */
function isDrizzleQueryErrorLike(value: unknown): boolean {
  return typeof value === "object" && value !== null && "query" in value && "params" in value;
}

/**
 * Traduz falhas de persistência em APIError consistentes:
 *  - unicidade (23505) → 409
 *  - banco indisponível → 503
 *  - CHECK violation (23514) → 400
 *  - APIError já intencional → relançado
 *  - demais falhas → 500 sem detalhes sensíveis
 *
 * Nunca loga o wrapper do Drizzle (que carrega SQL e parâmetros — incluindo
 * hashes de senha). Loga apenas a mensagem segura do erro do PostgreSQL.
 */
export function translatePersistenceError(error: unknown, messages: PersistenceErrorMessages = {}): never {
  if (error instanceof APIError) throw error;

  const uniqueViolation = toUniqueViolationError(error);
  if (uniqueViolation) {
    if (uniqueViolation.constraintName === "users_cpf_unique") {
      throw APIError.alreadyExists(messages.cpf ?? "CPF já está em uso.");
    }
    if (uniqueViolation.constraintName === "users_email_lower_unique") {
      throw APIError.alreadyExists(messages.email ?? "E-mail já está em uso.");
    }
    throw APIError.alreadyExists(messages.fallbackConflict ?? "Registro já existente.");
  }

  if (isDatabaseUnavailable(error)) {
    throw APIError.unavailable("Banco de dados indisponível. Tente novamente em instantes.");
  }

  if (isCheckViolation(error)) {
    throw APIError.invalidArgument("Dados inválidos para gravação.");
  }

  const databaseError = findPostgresError(error);
  const detail =
    databaseError?.message ??
    (isDrizzleQueryErrorLike(error)
      ? "consulta SQL falhou (parâmetros suprimidos do log)"
      : error instanceof Error
        ? error.message
        : "erro desconhecido");
  const databaseDetail = databaseError
    ? ` [code=${databaseError.code}${databaseError.constraint_name ? `, constraint=${databaseError.constraint_name}` : ""}]`
    : "";

  log.error(`Erro inesperado em operação de persistência: ${detail}${databaseDetail}`);

  throw APIError.internal(messages.fallbackInternal ?? "Não foi possível concluir a operação.");
}
