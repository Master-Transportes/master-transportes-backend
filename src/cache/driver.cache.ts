import { redis } from "@/infra/cache/redis-client";
import { CACHE_KEYS } from "@/infra/cache/keys-cache";
import { PROFILE_CACHE_TTL_SECONDS, withJitter } from "@/constants/cache";
import { safeJsonParse, execPipelineSettled } from "@/utils/redis-helpers";
import { DriverProfileSchema, DriverBaseSchema } from "@/schemas/cache-schemas";
import log from "encore.dev/log";
import type { IDriverCache } from "./contracts/IDriverCache";

export class RedisDriverCache implements IDriverCache {
  async getProfile<T>(driverId: string): Promise<T | null> {
    try {
      const raw = await redis.get(CACHE_KEYS.DRIVER(driverId));
      return safeJsonParse(raw, DriverProfileSchema) as T | null;
    } catch (err) {
      log.warn("Redis read failed for driver profile", { error: err, driverId, component: "driver-cache" });
      return null;
    }
  }

  async getBase(driverId: string): Promise<{ role: string; status: string } | null> {
    try {
      const raw = await redis.get(CACHE_KEYS.DRIVER_BASE(driverId));
      return safeJsonParse(raw, DriverBaseSchema);
    } catch (err) {
      log.warn("Redis read failed for driver base", { error: err, driverId, component: "driver-cache" });
      return null;
    }
  }

  async setProfile(driverId: string, profile: Record<string, unknown>): Promise<void> {
    try {
      await redis.set(
        CACHE_KEYS.DRIVER(driverId),
        JSON.stringify(profile),
        "EX",
        withJitter(PROFILE_CACHE_TTL_SECONDS),
      );
    } catch (err) {
      log.warn("Redis write failed for driver profile", { error: err, driverId, component: "driver-cache" });
    }
  }

  async setBase(driverId: string, data: { role: string; status: string }): Promise<void> {
    try {
      await redis.set(
        CACHE_KEYS.DRIVER_BASE(driverId),
        JSON.stringify(data),
        "EX",
        withJitter(PROFILE_CACHE_TTL_SECONDS),
      );
    } catch (err) {
      log.warn("Redis write failed for driver base", { error: err, driverId, component: "driver-cache" });
    }
  }

  async invalidate(driverId: string): Promise<void> {
    try {
      const pipeline = redis.pipeline();
      pipeline.del(CACHE_KEYS.DRIVER(driverId));
      pipeline.del(CACHE_KEYS.DRIVER_BASE(driverId));
      await execPipelineSettled(pipeline);
    } catch (err) {
      log.warn("Redis cache invalidation failed", { error: err, driverId, component: "driver-cache" });
    }
  }
}

export const driverCache = new RedisDriverCache();
