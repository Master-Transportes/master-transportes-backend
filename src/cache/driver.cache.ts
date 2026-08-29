import { redis } from "@/infra/cache/redis-client";
import { CACHE_KEYS } from "@/infra/cache/keys-cache";
import { PROFILE_CACHE_TTL_SECONDS } from "@/constants/cache";
import type { IDriverCache } from "./contracts/IDriverCache";

export class RedisDriverCache implements IDriverCache {
  async getProfile<T>(driverId: string): Promise<T | null> {
    const raw = await redis.get(CACHE_KEYS.DRIVER(driverId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed as T;
  }

  async setProfile(driverId: string, profile: Record<string, unknown>): Promise<void> {
    await redis.set(CACHE_KEYS.DRIVER(driverId), JSON.stringify(profile), "EX", PROFILE_CACHE_TTL_SECONDS);
  }

  async getBase(driverId: string): Promise<{ role: string; status: string } | null> {
    const raw = await redis.get(CACHE_KEYS.DRIVER_BASE(driverId));
    if (!raw) return null;
    return JSON.parse(raw) as { role: string; status: string };
  }

  async setBase(driverId: string, data: { role: string; status: string }): Promise<void> {
    await redis.set(CACHE_KEYS.DRIVER_BASE(driverId), JSON.stringify(data), "EX", PROFILE_CACHE_TTL_SECONDS);
  }

  async invalidate(driverId: string): Promise<void> {
    await Promise.all([redis.del(CACHE_KEYS.DRIVER(driverId)), redis.del(CACHE_KEYS.DRIVER_BASE(driverId))]);
  }
}

export const driverCache = new RedisDriverCache();
