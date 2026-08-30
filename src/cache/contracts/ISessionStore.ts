import type { SessionRow } from "@/infra/database/schema";

export interface SessionMetadata {
  ipAddress?: string;
  userAgent?: string;
  deviceId?: string;
}

export interface ISessionStore {
  create(input: { userId: string; userType: "CLIENT" | "DRIVER" } & SessionMetadata): Promise<{ sessionId: string; refreshToken: string }>;
  get(sessionId: string): Promise<SessionRow | null>;
  findByRefreshToken(refreshToken: string): Promise<SessionRow | null>;
  rotateRefreshToken(sessionId: string, oldRefreshToken: string): Promise<string | null>;
  revoke(sessionId: string): Promise<void>;
  revokeAll(userId: string): Promise<void>;
  updateLastSeenAt(sessionId: string): Promise<void>;
  getUserSessionIds(userId: string): Promise<string[]>;
  count(userId: string): Promise<number>;
}
