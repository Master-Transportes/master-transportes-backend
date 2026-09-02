import { CACHE_KEYS } from "@/infra/cache/keys-cache";
import { redis } from "@/infra/cache/redis-client";
import { SESSION_CACHE_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS, withJitter } from "@/constants/cache";
import { generateRefreshToken, hashRefreshToken } from "@/auth/auth";
import { safeJsonParse, execPipelineSettled, smembersSafe } from "@/utils/redis-helpers";
import { z } from "zod";
import log from "encore.dev/log";
import type { SessionRow, NewSession } from "@/infra/database/schema";
import type { ISessionRepository } from "@/repositories/contracts/ISessionRepository";
import type { ISessionStore, SessionMetadata } from "./contracts/ISessionStore";

const SessionCacheSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  userType: z.enum(["CLIENT", "DRIVER"]),
  refreshTokenHash: z.string(),
  deviceId: z.string().nullable(),
  userAgent: z.string().nullable(),
  ipAddress: z.string().nullable(),
  createdAt: z.coerce.date(),
  lastSeenAt: z.coerce.date(),
  expiresAt: z.coerce.date(),
  revokedAt: z.coerce.date().nullable(),
});

export class SessionStore implements ISessionStore {
  constructor(private readonly sessionRepo: ISessionRepository) {}

  async create(
    input: { userId: string; userType: "CLIENT" | "DRIVER" } & SessionMetadata,
  ): Promise<{ sessionId: string; refreshToken: string }> {
    if (input.deviceId) {
      const existingSession = await this.sessionRepo.findActiveByDeviceId(input.userId, input.deviceId);
      if (existingSession) {
        await this.revoke(existingSession.id);
      }
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
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      deviceId: input.deviceId ?? null,
    };

    const session = await this.sessionRepo.create(sessionData);

    const cacheData = { ...session, refreshTokenHash };
    const pipeline = redis.pipeline();
    pipeline.set(
      CACHE_KEYS.SESSION(session.id),
      JSON.stringify(cacheData),
      "EX",
      withJitter(SESSION_CACHE_TTL_SECONDS),
    );
    pipeline.sadd(CACHE_KEYS.CLIENT_SESSIONS(input.userId), session.id);
    pipeline.expire(CACHE_KEYS.CLIENT_SESSIONS(input.userId), withJitter(SESSION_CACHE_TTL_SECONDS));
    await execPipelineSettled(pipeline);

    return { sessionId: session.id, refreshToken };
  }

  async get(sessionId: string): Promise<SessionRow | null> {
    try {
      const cached = await redis.get(CACHE_KEYS.SESSION(sessionId));
      const parsed = safeJsonParse(cached, SessionCacheSchema);
      if (parsed) {
        if (parsed.revokedAt) return null;
        return parsed;
      }
    } catch (err) {
      log.warn("Redis read failed, falling back to database", {
        error: err,
        sessionId,
        component: "session-store",
      });
    }

    const session = await this.sessionRepo.findById(sessionId);
    if (!session) return null;

    try {
      const cacheData = { ...session };
      await redis.set(
        CACHE_KEYS.SESSION(sessionId),
        JSON.stringify(cacheData),
        "EX",
        withJitter(SESSION_CACHE_TTL_SECONDS),
      );
    } catch (err) {
      log.warn("Redis write failed during session read", {
        error: err,
        sessionId,
        component: "session-store",
      });
    }

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
    const newRefreshToken = generateRefreshToken();
    const newHash = hashRefreshToken(newRefreshToken);

    const rotated = await this.sessionRepo.rotateRefreshToken(sessionId, oldHash, newHash);
    if (!rotated) {
      await this.sessionRepo.revokeAllByUserId(session.userId);

      try {
        const oldSessionIds = await smembersSafe(redis, CACHE_KEYS.CLIENT_SESSIONS(session.userId));
        if (oldSessionIds.length > 0) {
          const pipeline = redis.pipeline();
          oldSessionIds.forEach(id => pipeline.del(CACHE_KEYS.SESSION(id)));
          pipeline.del(CACHE_KEYS.CLIENT_SESSIONS(session.userId));
          await pipeline.exec();
        }
      } catch (err) {
        log.warn("Redis cache cleanup failed during token rotation (revokeAll)", {
          error: err,
          userId: session.userId,
          component: "session-store",
        });
      }

      return null;
    }

    const updatedSession = { ...session, refreshTokenHash: newHash };
    try {
      await redis.set(
        CACHE_KEYS.SESSION(sessionId),
        JSON.stringify(updatedSession),
        "EX",
        withJitter(SESSION_CACHE_TTL_SECONDS),
      );
    } catch (err) {
      log.warn("Redis write failed during token rotation", {
        error: err,
        sessionId,
        component: "session-store",
      });
    }

    return newRefreshToken;
  }

  async revoke(sessionId: string): Promise<void> {
    const session = await this.sessionRepo.findById(sessionId);

    await this.sessionRepo.revoke(sessionId);

    try {
      const pipeline = redis.pipeline();
      pipeline.del(CACHE_KEYS.SESSION(sessionId));
      if (session) {
        pipeline.srem(CACHE_KEYS.CLIENT_SESSIONS(session.userId), sessionId);
      }
      const results = await pipeline.exec();

      if (session) {
        const sremResult = results?.[1]?.[1] as number | undefined;
        if (typeof sremResult === "number" && sremResult === 0) {
          await redis.del(CACHE_KEYS.CLIENT_SESSIONS(session.userId));
        }
      }
    } catch (err) {
      log.warn("Redis cache cleanup failed after revoke", {
        error: err,
        sessionId,
        component: "session-store",
      });
    }
  }

  async revokeAll(userId: string): Promise<void> {
    await this.sessionRepo.revokeAllByUserId(userId);

    try {
      const sessionIds = await smembersSafe(redis, CACHE_KEYS.CLIENT_SESSIONS(userId));
      if (sessionIds.length > 0) {
        const pipeline = redis.pipeline();
        sessionIds.forEach(id => pipeline.del(CACHE_KEYS.SESSION(id)));
        pipeline.del(CACHE_KEYS.CLIENT_SESSIONS(userId));
        await pipeline.exec();
      }
    } catch (err) {
      log.warn("Redis cache cleanup failed after revokeAll", {
        error: err,
        userId,
        component: "session-store",
      });
    }
  }

  async updateLastSeenAt(sessionId: string): Promise<void> {
    this.sessionRepo.updateLastSeenAt(sessionId).catch(() => {});
  }

  async getUserSessionIds(userId: string): Promise<string[]> {
    return smembersSafe(redis, CACHE_KEYS.CLIENT_SESSIONS(userId));
  }

  async findAllActiveByUserId(userId: string): Promise<SessionRow[]> {
    return this.sessionRepo.findAllActiveByUserId(userId);
  }

  async count(userId: string): Promise<number> {
    return redis.scard(CACHE_KEYS.CLIENT_SESSIONS(userId));
  }
}
