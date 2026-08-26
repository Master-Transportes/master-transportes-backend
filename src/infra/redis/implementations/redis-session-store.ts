import { APIError } from "encore.dev/api";
import { createHash, randomBytes, randomUUID } from "crypto";
import { CACHE_KEYS } from "@/infra/redis/keys-cache";
import { redis } from "@/infra/redis/redis-client";
import { metrics } from "@/infra/metrics/metrics";
import { SESSION_TTL_SECONDS } from "@/constants/cache";
import type { Session } from "@/dto/session.interface";
import type { Role } from "@/infra/drizzle/schema";
import type { ISessionStore } from "@/infra/redis/contracts/ISessionStore";

export class RedisSessionStore implements ISessionStore {
  private generateRefreshToken(): string {
    return randomBytes(32).toString("hex");
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  async create(input: { userId: string; role: Role }): Promise<{ sessionId: string; refreshToken: string }> {
    const startTime = Date.now();
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

    metrics.incCounter("session_create_total");
    metrics.observeHistogram("session_operation_duration_ms", Date.now() - startTime);

    return { sessionId, refreshToken };
  }

  async get(sessionId: string): Promise<Session | null> {
    const startTime = Date.now();
    const raw = await redis.get(CACHE_KEYS.SESSION(sessionId));
    metrics.incCounter("session_get_total");
    metrics.observeHistogram("session_operation_duration_ms", Date.now() - startTime);
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  }

  async refresh(
    sessionId: string,
    oldRefreshToken: string,
  ): Promise<{ refreshToken: string; userId: string; role: string }> {
    const startTime = Date.now();
    const session = await this.get(sessionId);

    if (!session) {
      throw APIError.unauthenticated("Sessão não encontrada ou expirada.");
    }

    const incomingHash = this.hashToken(oldRefreshToken);
    if (incomingHash !== session.refreshHash) {
      throw APIError.unauthenticated("Refresh token inválido.");
    }

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

    metrics.incCounter("session_refresh_total");
    metrics.observeHistogram("session_operation_duration_ms", Date.now() - startTime);

    return { refreshToken: newRefreshToken, userId: session.userId, role: session.role };
  }

  async revoke(sessionId: string): Promise<void> {
    const startTime = Date.now();
    const session = await this.get(sessionId);
    if (!session) return;

    const remaining = await redis.srem(CACHE_KEYS.USER_SESSIONS(session.userId), sessionId);
    if (remaining === 0) {
      await redis.del(CACHE_KEYS.USER_SESSIONS(session.userId));
    }
    await redis.del(CACHE_KEYS.SESSION(sessionId));

    metrics.incCounter("session_revoke_total");
    metrics.observeHistogram("session_operation_duration_ms", Date.now() - startTime);
  }

  async revokeAll(userId: string): Promise<void> {
    const startTime = Date.now();
    const sessionIds = await redis.smembers(CACHE_KEYS.USER_SESSIONS(userId));
    if (sessionIds.length === 0) return;

    const keys = sessionIds.map((sid: string) => CACHE_KEYS.SESSION(sid));

    await Promise.all([...keys.map((key: string) => redis.del(key)), redis.del(CACHE_KEYS.USER_SESSIONS(userId))]);

    metrics.incCounter("session_revoke_all_total");
    metrics.observeHistogram("session_operation_duration_ms", Date.now() - startTime);
  }

  async getUserSessionIds(userId: string): Promise<string[]> {
    const startTime = Date.now();
    const result = await redis.smembers(CACHE_KEYS.USER_SESSIONS(userId));
    metrics.incCounter("session_get_user_ids_total");
    metrics.observeHistogram("session_operation_duration_ms", Date.now() - startTime);
    return result;
  }

  async count(userId: string): Promise<number> {
    const startTime = Date.now();
    const result = await redis.scard(CACHE_KEYS.USER_SESSIONS(userId));
    metrics.incCounter("session_count_total");
    metrics.observeHistogram("session_operation_duration_ms", Date.now() - startTime);
    return result;
  }
}

export const sessionStore = new RedisSessionStore();
