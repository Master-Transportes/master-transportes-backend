import type { SessionRow } from "@/infra/database/schema";

export interface ISessionStore {
  create(input: { userId: string; userType: "CLIENT" | "DRIVER" }): Promise<{ sessionId: string; refreshToken: string }>;
  get(sessionId: string): Promise<SessionRow | null>;
  findByRefreshToken(refreshToken: string): Promise<SessionRow | null>;
  rotateRefreshToken(sessionId: string, oldRefreshToken: string): Promise<string | null>;
  revoke(sessionId: string): Promise<void>;
  revokeAll(userId: string): Promise<void>;
  updateLastSeenAt(sessionId: string): Promise<void>;
}
