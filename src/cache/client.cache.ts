import { redis } from "@/infra/cache/redis-client";
import { CACHE_KEYS } from "@/infra/cache/keys-cache";
import { PROFILE_CACHE_TTL_SECONDS, withJitter } from "@/constants/cache";
import { safeJsonParse, execPipelineSettled } from "@/utils/redis-helpers";
import { ClientProfileSchema, ClientBaseSchema } from "@/schemas/cache-schemas";
import log from "encore.dev/log";
import type { IClientCache } from "./contracts/IClientCache";

export class RedisClientCache implements IClientCache {
  async getProfile<T>(clientId: string): Promise<T | null> {
    try {
      const raw = await redis.get(CACHE_KEYS.CLIENT(clientId));
      return safeJsonParse(raw, ClientProfileSchema) as T | null;
    } catch (err) {
      log.warn("Redis read failed for client profile", { error: err, clientId, component: "client-cache" });
      return null;
    }
  }

  async getBase(clientId: string): Promise<{ role: string; status: string } | null> {
    try {
      const raw = await redis.get(CACHE_KEYS.CLIENT_BASE(clientId));
      return safeJsonParse(raw, ClientBaseSchema);
    } catch (err) {
      log.warn("Redis read failed for client base", { error: err, clientId, component: "client-cache" });
      return null;
    }
  }

  async setProfile(clientId: string, profile: Record<string, unknown>): Promise<void> {
    try {
      await redis.set(
        CACHE_KEYS.CLIENT(clientId),
        JSON.stringify(profile),
        "EX",
        withJitter(PROFILE_CACHE_TTL_SECONDS),
      );
    } catch (err) {
      log.warn("Redis write failed for client profile", { error: err, clientId, component: "client-cache" });
    }
  }

  async setBase(clientId: string, data: { role: string; status: string }): Promise<void> {
    try {
      await redis.set(
        CACHE_KEYS.CLIENT_BASE(clientId),
        JSON.stringify(data),
        "EX",
        withJitter(PROFILE_CACHE_TTL_SECONDS),
      );
    } catch (err) {
      log.warn("Redis write failed for client base", { error: err, clientId, component: "client-cache" });
    }
  }

  async invalidate(clientId: string): Promise<void> {
    try {
      const pipeline = redis.pipeline();
      pipeline.del(CACHE_KEYS.CLIENT(clientId));
      pipeline.del(CACHE_KEYS.CLIENT_BASE(clientId));
      await execPipelineSettled(pipeline);
    } catch (err) {
      log.warn("Redis cache invalidation failed", { error: err, clientId, component: "client-cache" });
    }
  }
}

export const clientCache = new RedisClientCache();
