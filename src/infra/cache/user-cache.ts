import { redis } from "@/infra/cache/redis-client";
import { CACHE_KEYS } from "@/infra/cache/keys-cache";
import { metrics } from "@/infra/metrics";
import type { IUserCache } from "@/contracts/IUserCache";

export class RedisUserCache implements IUserCache {
  async getProfile<T>(userId: string): Promise<T | null> {
    const startTime = Date.now();
    const raw = await redis.get(CACHE_KEYS.USER(userId));
    metrics.incCounter("user_cache_get_total");
    metrics.observeHistogram("user_cache_operation_duration_ms", Date.now() - startTime);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  }

  async setProfile(userId: string, profile: Record<string, unknown>): Promise<void> {
    const startTime = Date.now();
    await redis.set(CACHE_KEYS.USER(userId), JSON.stringify(profile), "EX", 600);
    metrics.incCounter("user_cache_set_total");
    metrics.observeHistogram("user_cache_operation_duration_ms", Date.now() - startTime);
  }

  async setBase(userId: string, data: { role: string; status: string }): Promise<void> {
    const startTime = Date.now();
    await redis.set(CACHE_KEYS.USER_BASE(userId), JSON.stringify(data), "EX", 600);
    metrics.incCounter("user_cache_set_base_total");
    metrics.observeHistogram("user_cache_operation_duration_ms", Date.now() - startTime);
  }

  async invalidate(userId: string): Promise<void> {
    const startTime = Date.now();
    await Promise.all([
      redis.del(CACHE_KEYS.USER(userId)),
      redis.del(CACHE_KEYS.USER_BASE(userId)),
    ]);
    metrics.incCounter("user_cache_invalidate_total");
    metrics.observeHistogram("user_cache_operation_duration_ms", Date.now() - startTime);
  }
}

export const userCache = new RedisUserCache();
