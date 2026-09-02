import { redis } from "@/infra/cache/redis-client";
import { MATCHING_KEYS, DRIVER_LOCATION_TTL } from "@/infra/cache/keys-cache";
import { execPipelineSettled } from "@/utils/redis-helpers";
import log from "encore.dev/log";
import type { IDriverStatusStore } from "./contracts/IDriverStatusStore";

export class RedisDriverStatusStore implements IDriverStatusStore {
  async setAvailable(driverId: string): Promise<void> {
    try {
      const pipeline = redis.pipeline();
      pipeline.hset(MATCHING_KEYS.DRIVER_LOCATION(driverId), "status", "available");
      pipeline.expire(MATCHING_KEYS.DRIVER_LOCATION(driverId), DRIVER_LOCATION_TTL);
      await execPipelineSettled(pipeline);
    } catch (err) {
      log.warn("Redis setAvailable failed", { error: err, driverId, component: "driver-status-store" });
    }
  }
}

export const driverStatusStore = new RedisDriverStatusStore();
