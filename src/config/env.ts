/**
 * Configuração de ambiente — ÚNICA porta de entrada para variáveis de ambiente.
 *
 * O `.env` é a fonte de configuração (carregado aqui uma única vez via dotenv).
 * Em ambientes onde o `.env` não existe, as variáveis devem ser fornecidas pelo
 * ambiente do processo — `dotenv` nunca sobrescreve valores já definidos.
 */
import "dotenv/config";

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) return undefined;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function requireEnv(name: string): string {
  const value = readEnv(name);
  if (!value) {
    throw new Error(`${name} não está definida nas variáveis de ambiente.`);
  }
  return value;
}

export function getDatabaseUrl(): string {
  return requireEnv("DATABASE_URL");
}

export function getRedisUrl(): string {
  return readEnv("REDIS_STATE_URL") ?? "redis://127.0.0.1:6379";
}

export function getRedisPassword(): string | undefined {
  return readEnv("REDIS_PASSWORD");
}

const MIN_SECRET_LENGTH = 32;

export function getJwtSecret(): string {
  const value = requireEnv("JWT_SECRET");
  if (value.length < MIN_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET deve ter ao menos ${MIN_SECRET_LENGTH} caracteres.`);
  }
  return value;
}

export function getRefreshTokenSecret(): string {
  const value = requireEnv("REFRESH_TOKEN_SECRET");
  if (value.length < MIN_SECRET_LENGTH) {
    throw new Error(`REFRESH_TOKEN_SECRET deve ter ao menos ${MIN_SECRET_LENGTH} caracteres.`);
  }
  return value;
}

/**
 * Valida o par de segredos de autenticação sem expor os valores.
 * JWT e refresh token precisam de segredos distintos e suficientemente longos.
 */
export function validateAuthSecretPair(jwtSecret: string, refreshSecret: string): void {
  if (jwtSecret.length < MIN_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET deve ter ao menos ${MIN_SECRET_LENGTH} caracteres.`);
  }
  if (refreshSecret.length < MIN_SECRET_LENGTH) {
    throw new Error(`REFRESH_TOKEN_SECRET deve ter ao menos ${MIN_SECRET_LENGTH} caracteres.`);
  }
  if (jwtSecret === refreshSecret) {
    throw new Error("JWT_SECRET e REFRESH_TOKEN_SECRET devem ser diferentes.");
  }
}

/** Validação de inicialização do processo. Não registra os valores. */
export function assertAuthSecretsDistinct(): void {
  validateAuthSecretPair(getJwtSecret(), getRefreshTokenSecret());
}
