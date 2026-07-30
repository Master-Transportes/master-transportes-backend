import { redis } from "@/infra/redis/redis-client";
import { MATCHING_KEYS } from "@/infra/redis/keys-cache";
import { DRIVER_LOCATION_TTL } from "@/infra/redis/keys-cache";
import type { IDriverStatusStore } from "@/infra/redis/contracts/IDriverStatusStore";

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
