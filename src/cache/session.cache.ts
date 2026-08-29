import { createHash, randomBytes, randomUUID } from "crypto";
import { CACHE_KEYS } from "@/infra/cache/keys-cache";
import { redis } from "@/infra/cache/redis-client";
import { SESSION_TTL_SECONDS } from "@/constants/cache";
import type { Session } from "@/dto/session.interface";
import type { Role } from "@/infra/database/schema";
import type { ISessionStore } from "./contracts/ISessionStore";

export class RedisSessionStore implements ISessionStore {
  private generateRefreshToken(): string {
    return randomBytes(32).toString("hex");
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  async create(input: { userId: string; role: Role }): Promise<{ sessionId: string; refreshToken: string }> {
    const sessionId = randomUUID();
    const refreshToken = this.generateRefreshToken();
    const refreshHash = this.hashToken(refreshToken);
    const now = new Date();

    const session: Session = {
      sessionId,
      userId: input.userId,
      role: input.role,
      refreshHash,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString(),
    };

    await Promise.all([
      redis.set(CACHE_KEYS.SESSION(sessionId), JSON.stringify(session), "EX", SESSION_TTL_SECONDS),
      redis.sadd(CACHE_KEYS.USER_SESSIONS(input.userId), sessionId),
      redis.expire(CACHE_KEYS.USER_SESSIONS(input.userId), SESSION_TTL_SECONDS),
    ]);

    return { sessionId, refreshToken };
  }

  async get(sessionId: string): Promise<Session | null> {
    const raw = await redis.get(CACHE_KEYS.SESSION(sessionId));
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  }

  async refresh(
    sessionId: string,
    oldRefreshToken: string,
  ): Promise<{ refreshToken: string; userId: string; role: string } | null> {
    const session = await this.get(sessionId);
    if (!session) return null;

    const incomingHash = this.hashToken(oldRefreshToken);
    if (incomingHash !== session.refreshHash) return null;

    const newRefreshToken = this.generateRefreshToken();
    const newHash = this.hashToken(newRefreshToken);

    const updated: Session = {
      ...session,
      refreshHash: newHash,
    };

    await Promise.all([
      redis.set(CACHE_KEYS.SESSION(sessionId), JSON.stringify(updated), "EX", SESSION_TTL_SECONDS),
      redis.expire(CACHE_KEYS.USER_SESSIONS(session.userId), SESSION_TTL_SECONDS),
    ]);

    return { refreshToken: newRefreshToken, userId: session.userId, role: session.role };
  }

  async revoke(sessionId: string): Promise<void> {
    const session = await this.get(sessionId);
    if (!session) return;

    const remaining = await redis.srem(CACHE_KEYS.USER_SESSIONS(session.userId), sessionId);
    if (remaining === 0) {
      await redis.del(CACHE_KEYS.USER_SESSIONS(session.userId));
    }
    await redis.del(CACHE_KEYS.SESSION(sessionId));
  }

  async revokeAll(userId: string): Promise<void> {
    const sessionIds = await redis.smembers(CACHE_KEYS.USER_SESSIONS(userId));
    if (sessionIds.length === 0) return;

    const keys = sessionIds.map((sid: string) => CACHE_KEYS.SESSION(sid));

    await Promise.all([...keys.map((key: string) => redis.del(key)), redis.del(CACHE_KEYS.USER_SESSIONS(userId))]);
  }

  async getUserSessionIds(userId: string): Promise<string[]> {
    return redis.smembers(CACHE_KEYS.USER_SESSIONS(userId));
  }

  async count(userId: string): Promise<number> {
    return redis.scard(CACHE_KEYS.USER_SESSIONS(userId));
  }
}

export const sessionStore = new RedisSessionStore();
