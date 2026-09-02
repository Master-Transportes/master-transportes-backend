import { redis } from "@/infra/cache/redis-client";
import { CACHE_KEYS } from "@/infra/cache/keys-cache";
import { PROFILE_CACHE_TTL_SECONDS } from "@/constants/cache";
import type { IClientCache } from "./contracts/IClientCache";

export class RedisClientCache implements IClientCache {
  async getProfile<T>(clientId: string): Promise<T | null> {
    const raw = await redis.get(CACHE_KEYS.CLIENT(clientId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed as T;
  }

  async getBase(clientId: string): Promise<{ role: string; status: string } | null> {
    const raw = await redis.get(CACHE_KEYS.CLIENT_BASE(clientId));
    if (!raw) return null;
    return JSON.parse(raw) as { role: string; status: string };
  }

  async setProfile(clientId: string, profile: Record<string, unknown>): Promise<void> {
    await redis.set(CACHE_KEYS.CLIENT(clientId), JSON.stringify(profile), "EX", PROFILE_CACHE_TTL_SECONDS);
  }

  async setBase(clientId: string, data: { role: string; status: string }): Promise<void> {
    await redis.set(CACHE_KEYS.CLIENT_BASE(clientId), JSON.stringify(data), "EX", PROFILE_CACHE_TTL_SECONDS);
  }

  async invalidate(clientId: string): Promise<void> {
    await Promise.all([redis.del(CACHE_KEYS.CLIENT(clientId)), redis.del(CACHE_KEYS.CLIENT_BASE(clientId))]);
  }
}

export const clientCache = new RedisClientCache();
