import { redis } from "@/infra/cache/redis-client";
import { CACHE_KEYS } from "@/infra/cache/keys-cache";
import { PROFILE_CACHE_TTL_SECONDS } from "@/constants/cache";
import type { IUserCache } from "./contracts/IUserCache";

export class RedisUserCache implements IUserCache {
  async getProfile<T>(userId: string): Promise<T | null> {
    const raw = await redis.get(CACHE_KEYS.USER(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed as T;
  }

  async getBase(userId: string): Promise<{ role: string; status: string } | null> {
    const raw = await redis.get(CACHE_KEYS.USER_BASE(userId));
    if (!raw) return null;
    return JSON.parse(raw) as { role: string; status: string };
  }

  async setProfile(userId: string, profile: Record<string, unknown>): Promise<void> {
    await redis.set(CACHE_KEYS.USER(userId), JSON.stringify(profile), "EX", PROFILE_CACHE_TTL_SECONDS);
  }

  async setBase(userId: string, data: { role: string; status: string }): Promise<void> {
    await redis.set(CACHE_KEYS.USER_BASE(userId), JSON.stringify(data), "EX", PROFILE_CACHE_TTL_SECONDS);
  }

  async invalidate(userId: string): Promise<void> {
    await Promise.all([redis.del(CACHE_KEYS.USER(userId)), redis.del(CACHE_KEYS.USER_BASE(userId))]);
  }
}

export const userCache = new RedisUserCache();
