import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { ErrorReason } from "@/constants/error-reasons";
import {
  findPostgresError,
  isCheckViolation,
  isDatabaseUnavailable,
  toUniqueViolationError,
} from "@/repositories/database-errors";

interface PersistenceErrorMessages {
  conflictMessage?: string;
  conflictReason?: string;
  fallbackInternal?: string;
}

/**
 * Traduz falhas de persistência em APIError consistentes:
 *  - unicidade (23505) → 409
 *  - banco indisponível → 503
 *  - CHECK violation (23514) → 400
 *  - APIError já intencional → relançado
 *  - demais falhas → 500 sem detalhes sensíveis
 *
 * Nunca loga a mensagem do driver nem o wrapper do Drizzle (que carrega SQL e
 * parâmetros — incluindo hashes de senha). Loga apenas código e constraint.
 */
export function translatePersistenceError(error: unknown, messages: PersistenceErrorMessages = {}): never {
  if (error instanceof APIError) throw error;

  const uniqueViolation = toUniqueViolationError(error);
  if (uniqueViolation) {
    throw APIError.alreadyExists(messages.conflictMessage ?? "Não foi possível concluir a operação.").withDetails({
      reason: messages.conflictReason ?? ErrorReason.RESOURCE_CONFLICT,
    });
  }

  if (isDatabaseUnavailable(error)) {
    throw APIError.unavailable("Banco de dados indisponível. Tente novamente em instantes.").withDetails({
      reason: ErrorReason.SERVICE_UNAVAILABLE,
    });
  }

  if (isCheckViolation(error)) {
    throw APIError.invalidArgument("Dados inválidos para gravação.");
  }

  const databaseError = findPostgresError(error);
  const databaseDetail = databaseError
    ? ` [code=${databaseError.code}${databaseError.constraint_name ? `, constraint=${databaseError.constraint_name}` : ""}]`
    : "";

  log.error(`Erro inesperado em operação de persistência${databaseDetail}`);

  throw APIError.internal(messages.fallbackInternal ?? "Não foi possível concluir a operação.");
}
