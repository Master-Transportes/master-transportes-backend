import { redis } from "@/infra/cache/redis-client";
import { MATCHING_KEYS, DRIVER_LOCATION_TTL } from "@/infra/cache/keys-cache";
import type { IDriverStatusStore } from "./contracts/IDriverStatusStore";

export class RedisDriverStatusStore implements IDriverStatusStore {
  async setAvailable(driverId: string): Promise<void> {
    await redis
      .pipeline()
      .hset(MATCHING_KEYS.DRIVER_LOCATION(driverId), "status", "available")
      .expire(MATCHING_KEYS.DRIVER_LOCATION(driverId), DRIVER_LOCATION_TTL)
      .exec();
  }
}

export const driverStatusStore = new RedisDriverStatusStore();
