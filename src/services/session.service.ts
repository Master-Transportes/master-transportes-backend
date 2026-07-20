import { APIError } from "encore.dev/api";
import { createHash, randomBytes, randomUUID } from "crypto";
import { CACHE_KEYS } from "@/infra/cache/keys-cache";
import type { Session } from "@/interfaces/session.interface";
import type { Role } from "@/infra/db/schema";
import { RedisCache, cache } from "@/infra/cache";

const SEVEN_DAYS_IN_S = 7 * 24 * 60 * 60;

export class SessionService {
  constructor(private readonly cache: RedisCache) {}

  private generateRefreshToken(): string {
    return randomBytes(32).toString("hex");
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  async create(input: {
    userId: string;
    role: Role;
  }): Promise<{ sessionId: string; refreshToken: string }> {
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
      expiresAt: new Date(now.getTime() + SEVEN_DAYS_IN_S * 1000).toISOString(),
    };

    await Promise.all([
      this.cache.set(CACHE_KEYS.SESSION(sessionId), session, { ttlSeconds: SEVEN_DAYS_IN_S }),
      this.cache.sadd(CACHE_KEYS.USER_SESSIONS(input.userId), sessionId),
      this.cache.expire(CACHE_KEYS.USER_SESSIONS(input.userId), SEVEN_DAYS_IN_S),
    ]);

    return { sessionId, refreshToken };
  }

  async get(sessionId: string): Promise<Session | null> {
    return this.cache.get<Session>(CACHE_KEYS.SESSION(sessionId));
  }

  async refresh(sessionId: string, oldRefreshToken: string): Promise<{ refreshToken: string; userId: string }> {
    const session = await this.cache.get<Session>(CACHE_KEYS.SESSION(sessionId));

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
      this.cache.set(CACHE_KEYS.SESSION(sessionId), updated, { ttlSeconds: SEVEN_DAYS_IN_S }),
      this.cache.expire(CACHE_KEYS.USER_SESSIONS(session.userId), SEVEN_DAYS_IN_S),
    ]);

    return { refreshToken: newRefreshToken, userId: session.userId };
  }

  async revoke(sessionId: string): Promise<void> {
    const session = await this.cache.get<Session>(CACHE_KEYS.SESSION(sessionId));
    if (!session) return;

    const remaining = await this.cache.srem(CACHE_KEYS.USER_SESSIONS(session.userId), sessionId);
    if (remaining === 0) {
      await this.cache.del(CACHE_KEYS.USER_SESSIONS(session.userId));
    }
    await this.cache.del(CACHE_KEYS.SESSION(sessionId));
  }

  async revokeAll(userId: string): Promise<void> {
    const sessionIds = await this.cache.smembers(CACHE_KEYS.USER_SESSIONS(userId));
    if (sessionIds.length === 0) return;

    const keys = sessionIds.map((sid: string) => CACHE_KEYS.SESSION(sid));

    await Promise.all([
      ...keys.map((key: string) => this.cache.del(key)),
      this.cache.del(CACHE_KEYS.USER_SESSIONS(userId)),
    ]);
  }

  async getUserSessionIds(userId: string): Promise<string[]> {
    return this.cache.smembers(CACHE_KEYS.USER_SESSIONS(userId));
  }

  async count(userId: string): Promise<number> {
    return this.cache.scard(CACHE_KEYS.USER_SESSIONS(userId));
  }
}

export const sessionService = new SessionService(cache);
