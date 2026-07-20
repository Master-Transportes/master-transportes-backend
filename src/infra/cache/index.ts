import { redis } from "./redis-client";
export { redis } from "./redis-client";
import { metrics } from "@/infra/metrics";

export class RedisCache {
  async set<T>(
    key: string,
    value: T,
    options?: {
      ttlSeconds?: number;
      ttlMs?: number;
      onlyIfNotExists?: boolean;
    },
  ): Promise<boolean> {
    const startTime = Date.now();
    const payload = JSON.stringify(value);

    if (options?.ttlSeconds) {
      const result = options.onlyIfNotExists
        ? await redis.set(key, payload, "EX", options.ttlSeconds, "NX")
        : await redis.set(key, payload, "EX", options.ttlSeconds);
      metrics.incCounter("redis_cache_set_total");
      metrics.observeHistogram("redis_cache_operation_duration_ms", Date.now() - startTime);
      return result === "OK";
    }

    if (options?.ttlMs) {
      const result = options.onlyIfNotExists
        ? await redis.set(key, payload, "PX", options.ttlMs, "NX")
        : await redis.set(key, payload, "PX", options.ttlMs);
      metrics.incCounter("redis_cache_set_total");
      metrics.observeHistogram("redis_cache_operation_duration_ms", Date.now() - startTime);
      return result === "OK";
    }

    if (options?.onlyIfNotExists) {
      const result = await redis.set(key, payload, "NX");
      metrics.incCounter("redis_cache_set_total");
      metrics.observeHistogram("redis_cache_operation_duration_ms", Date.now() - startTime);
      return result === "OK";
    }

    const result = await redis.set(key, payload);
    metrics.incCounter("redis_cache_set_total");
    metrics.observeHistogram("redis_cache_operation_duration_ms", Date.now() - startTime);
    return result === "OK";
  }

  async get<T>(key: string): Promise<T | null> {
    const startTime = Date.now();
    const raw = await redis.get(key);
    metrics.incCounter("redis_cache_get_total");
    metrics.observeHistogram("redis_cache_operation_duration_ms", Date.now() - startTime);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as T;
    } catch (err) {
      console.error("Redis JSON parse error:", err);
      return null;
    }
  }

  async del(...keys: string[]): Promise<number> {
    const startTime = Date.now();
    const result = await redis.del(...keys);
    metrics.incCounter("redis_cache_del_total");
    metrics.observeHistogram("redis_cache_operation_duration_ms", Date.now() - startTime);
    return result;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const startTime = Date.now();
    const result = await redis.expire(key, seconds);
    metrics.incCounter("redis_cache_expire_total");
    metrics.observeHistogram("redis_cache_operation_duration_ms", Date.now() - startTime);
    return result;
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    const startTime = Date.now();
    const result = await redis.sadd(key, ...members);
    metrics.incCounter("redis_cache_sadd_total");
    metrics.observeHistogram("redis_cache_operation_duration_ms", Date.now() - startTime);
    return result;
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    const startTime = Date.now();
    const result = await redis.srem(key, ...members);
    metrics.incCounter("redis_cache_srem_total");
    metrics.observeHistogram("redis_cache_operation_duration_ms", Date.now() - startTime);
    return result;
  }

  async scard(key: string): Promise<number> {
    const startTime = Date.now();
    const result = await redis.scard(key);
    metrics.incCounter("redis_cache_scard_total");
    metrics.observeHistogram("redis_cache_operation_duration_ms", Date.now() - startTime);
    return result;
  }

  async smembers(key: string): Promise<string[]> {
    const startTime = Date.now();
    const result = await redis.smembers(key);
    metrics.incCounter("redis_cache_smembers_total");
    metrics.observeHistogram("redis_cache_operation_duration_ms", Date.now() - startTime);
    return result;
  }
}

export const cache = new RedisCache();
