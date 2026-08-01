import { redis } from "@/infra/redis/redis-client";
import { CACHE_KEYS } from "@/infra/redis/keys-cache";
import { metrics } from "@/infra/metrics/metrics";
import type { IDriverCache } from "@/infra/redis/contracts/IDriverCache";

export class RedisDriverCache implements IDriverCache {
  async getProfile<T>(driverId: string): Promise<T | null> {
    const startTime = Date.now();
    const raw = await redis.get(CACHE_KEYS.DRIVER(driverId));
    metrics.incCounter("driver_cache_get_total");
    metrics.observeHistogram("driver_cache_operation_duration_ms", Date.now() - startTime);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed as T;
  }

  async setProfile(driverId: string, profile: Record<string, unknown>): Promise<void> {
    const startTime = Date.now();
    await redis.set(CACHE_KEYS.DRIVER(driverId), JSON.stringify(profile), "EX", 600);
    metrics.incCounter("driver_cache_set_total");
    metrics.observeHistogram("driver_cache_operation_duration_ms", Date.now() - startTime);
  }

  async getBase(driverId: string): Promise<{ role: string; status: string } | null> {
    const startTime = Date.now();
    const raw = await redis.get(CACHE_KEYS.DRIVER_BASE(driverId));
    metrics.incCounter("driver_cache_get_base_total");
    metrics.observeHistogram("driver_cache_operation_duration_ms", Date.now() - startTime);
    if (!raw) return null;
    return JSON.parse(raw) as { role: string; status: string };
  }

  async setBase(driverId: string, data: { role: string; status: string }): Promise<void> {
    const startTime = Date.now();
    await redis.set(CACHE_KEYS.DRIVER_BASE(driverId), JSON.stringify(data), "EX", 600);
    metrics.incCounter("driver_cache_set_base_total");
    metrics.observeHistogram("driver_cache_operation_duration_ms", Date.now() - startTime);
  }

  async invalidate(driverId: string): Promise<void> {
    const startTime = Date.now();
    await Promise.all([redis.del(CACHE_KEYS.DRIVER(driverId)), redis.del(CACHE_KEYS.DRIVER_BASE(driverId))]);
    metrics.incCounter("driver_cache_invalidate_total");
    metrics.observeHistogram("driver_cache_operation_duration_ms", Date.now() - startTime);
  }
}

export const driverCache = new RedisDriverCache();
