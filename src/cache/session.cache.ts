import { CACHE_KEYS } from "@/infra/cache/keys-cache";
import { redis } from "@/infra/cache/redis-client";
import { SESSION_CACHE_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS } from "@/constants/cache";
import { generateRefreshToken, hashRefreshToken } from "@/auth/auth";
import type { SessionRow, NewSession } from "@/infra/database/schema";
import type { ISessionRepository } from "@/repositories/contracts/ISessionRepository";
import type { ISessionStore } from "./contracts/ISessionStore";

export class SessionStore implements ISessionStore {
  constructor(private readonly sessionRepo: ISessionRepository) {}

  async create(input: { userId: string; userType: "CLIENT" | "DRIVER" }): Promise<{ sessionId: string; refreshToken: string }> {
    await this.sessionRepo.revokeAllByUserId(input.userId);

    const oldSessionIds = await redis.smembers(CACHE_KEYS.USER_SESSIONS(input.userId));
    if (oldSessionIds.length > 0) {
      await Promise.all([
        ...oldSessionIds.map((id: string) => redis.del(CACHE_KEYS.SESSION(id))),
        redis.del(CACHE_KEYS.USER_SESSIONS(input.userId)),
      ]);
    }

    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000);

    const sessionData: NewSession = {
      userId: input.userId,
      userType: input.userType,
      refreshTokenHash,
      expiresAt,
    };

    const session = await this.sessionRepo.create(sessionData);

    const cacheData = { ...session, refreshTokenHash };
    await Promise.all([
      redis.set(CACHE_KEYS.SESSION(session.id), JSON.stringify(cacheData), "EX", SESSION_CACHE_TTL_SECONDS),
      redis.sadd(CACHE_KEYS.USER_SESSIONS(input.userId), session.id),
      redis.expire(CACHE_KEYS.USER_SESSIONS(input.userId), SESSION_CACHE_TTL_SECONDS),
    ]);

    return { sessionId: session.id, refreshToken };
  }

  async get(sessionId: string): Promise<SessionRow | null> {
    const cached = await redis.get(CACHE_KEYS.SESSION(sessionId));
    if (cached) {
      const parsed = JSON.parse(cached) as SessionRow;
      if (parsed.revokedAt) return null;
      return parsed;
    }

    const session = await this.sessionRepo.findById(sessionId);
    if (!session) return null;

    const cacheData = { ...session };
    await redis.set(CACHE_KEYS.SESSION(sessionId), JSON.stringify(cacheData), "EX", SESSION_CACHE_TTL_SECONDS);

    return session;
  }

  async findByRefreshToken(refreshToken: string): Promise<SessionRow | null> {
    const hash = hashRefreshToken(refreshToken);
    const session = await this.sessionRepo.findByRefreshTokenHash(hash);
    if (!session) return null;

    if (new Date(session.expiresAt) < new Date()) {
      await this.sessionRepo.revoke(session.id);
      return null;
    }

    return session;
  }

  async rotateRefreshToken(sessionId: string, oldRefreshToken: string): Promise<string | null> {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) return null;

    const oldHash = hashRefreshToken(oldRefreshToken);
    if (session.refreshTokenHash !== oldHash) {
      await this.sessionRepo.revokeAllByUserId(session.userId);
      const oldSessionIds = await redis.smembers(CACHE_KEYS.USER_SESSIONS(session.userId));
      if (oldSessionIds.length > 0) {
        await Promise.all([
          ...oldSessionIds.map((id: string) => redis.del(CACHE_KEYS.SESSION(id))),
          redis.del(CACHE_KEYS.USER_SESSIONS(session.userId)),
        ]);
      }
      return null;
    }

    const newRefreshToken = generateRefreshToken();
    const newHash = hashRefreshToken(newRefreshToken);

    await this.sessionRepo.rotateRefreshToken(sessionId, newHash);

    const updatedSession = { ...session, refreshTokenHash: newHash };
    await redis.set(CACHE_KEYS.SESSION(sessionId), JSON.stringify(updatedSession), "EX", SESSION_CACHE_TTL_SECONDS);

    return newRefreshToken;
  }

  async revoke(sessionId: string): Promise<void> {
    await this.sessionRepo.revoke(sessionId);
    await redis.del(CACHE_KEYS.SESSION(sessionId));

    const session = await this.sessionRepo.findById(sessionId);
    if (session) {
      const remaining = await redis.srem(CACHE_KEYS.USER_SESSIONS(session.userId), sessionId);
      if (remaining === 0) {
        await redis.del(CACHE_KEYS.USER_SESSIONS(session.userId));
      }
    }
  }

  async revokeAll(userId: string): Promise<void> {
    await this.sessionRepo.revokeAllByUserId(userId);

    const sessionIds = await redis.smembers(CACHE_KEYS.USER_SESSIONS(userId));
    if (sessionIds.length > 0) {
      await Promise.all([
        ...sessionIds.map((id: string) => redis.del(CACHE_KEYS.SESSION(id))),
        redis.del(CACHE_KEYS.USER_SESSIONS(userId)),
      ]);
    }
  }

  async updateLastSeenAt(sessionId: string): Promise<void> {
    this.sessionRepo.updateLastSeenAt(sessionId).catch(() => {});
  }
}

export function createSessionStore(sessionRepo: ISessionRepository): SessionStore {
  return new SessionStore(sessionRepo);
}
