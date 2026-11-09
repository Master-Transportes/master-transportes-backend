import { expect } from "bun:test";
import { APIError } from "encore.dev/api";

/**
 * Segredos exclusivos de teste (não são credenciais reais).
 * Definidos em tempo de execução — o código de produção lê os segredos
 * somente no momento do uso.
 */
export function setTestSecrets(): void {
  process.env.JWT_SECRET = "test-jwt-secret-0123456789abcdef0123456789abcdef";
  process.env.REFRESH_TOKEN_SECRET = "test-refresh-secret-0123456789abcdef0123456789";
}

export async function captureApiError(promise: Promise<unknown>): Promise<APIError> {
  const result = await promise.then(
    () => null,
    (error: unknown) => error,
  );

  expect(result).toBeInstanceOf(APIError);
  return result as APIError;
}
