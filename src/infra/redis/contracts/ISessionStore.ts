import type { Role } from "@/infra/drizzle/schema";
import type { Session } from "@/dto/session.interface";

export interface ISessionStore {
  create(input: { userId: string; role: Role }): Promise<{ sessionId: string; refreshToken: string }>;
  get(sessionId: string): Promise<Session | null>;
  refresh(sessionId: string, oldRefreshToken: string): Promise<{ refreshToken: string; userId: string }>;
  revoke(sessionId: string): Promise<void>;
  revokeAll(userId: string): Promise<void>;
  getUserSessionIds(userId: string): Promise<string[]>;
  count(userId: string): Promise<number>;
}
