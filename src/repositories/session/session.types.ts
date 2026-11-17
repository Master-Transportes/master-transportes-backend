export interface CreateSessionInput {
  id: string;
  userId: string;
  refreshTokenHash: string;
  /** Prazo em segundos; a expiração é calculada pelo PostgreSQL (`now()`). */
  ttlSeconds: number;
}

export interface SessionRecord {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  /** Calculado pelo PostgreSQL (`expires_at <= now()`) para não depender do relógio do Node. */
  isExpired: boolean;
}

export interface ActiveSessionRecord {
  id: string;
  userId: string;
}

export interface RotateSessionInput {
  sessionId: string;
  expectedRefreshTokenHash: string;
  newRefreshTokenHash: string;
  /** Novo prazo em segundos; a expiração é calculada pelo PostgreSQL (`now()`). */
  ttlSeconds: number;
}
