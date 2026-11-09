export interface CreateSessionInput {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
}

export interface SessionRecord {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface ActiveSessionRecord {
  id: string;
  userId: string;
}

export interface RotateSessionInput {
  sessionId: string;
  expectedRefreshTokenHash: string;
  newRefreshTokenHash: string;
  newExpiresAt: Date;
}
