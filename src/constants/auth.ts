/** Constantes de autenticação — tempos de vida, emissor, audiência e custo de hash. */

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export const JWT_ISSUER = "master-transporte";
export const JWT_AUDIENCE = "master-transporte-api";
export const JWT_ALGORITHM = "HS256";
export const JWT_CLOCK_TOLERANCE_SECONDS = 5;

/** Custo do bcrypt. Aumentar aqui exige rehash progressivo no futuro. */
export const BCRYPT_COST = 12;

export const PASSWORD_MIN_LENGTH = 8;
/** bcrypt considera no máximo 72 bytes; nada além disso é significativo. */
export const PASSWORD_MAX_BYTES = 72;
