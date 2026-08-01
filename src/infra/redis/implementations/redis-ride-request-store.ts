import { redis } from "@/infra/redis/redis-client";
import { CACHE_KEYS } from "@/infra/redis/keys-cache";
import type { IRideRequestStore } from "@/infra/redis/contracts/IRideRequestStore";

export class RedisRideRequestStore implements IRideRequestStore {
  async lock(passengerId: string, rideId: string): Promise<boolean> {
    const lockKey = CACHE_KEYS.ACTIVE_RIDE_REQUEST(passengerId);
    const result = await redis.set(lockKey, rideId, "EX", 3600, "NX");
    return result !== null;
  }

  async release(passengerId: string): Promise<void> {
    await redis.del(CACHE_KEYS.ACTIVE_RIDE_REQUEST(passengerId));
  }

  async getLockedRideId(passengerId: string): Promise<string | null> {
    const lockKey = CACHE_KEYS.ACTIVE_RIDE_REQUEST(passengerId);
    return redis.get(lockKey);
  }
}

export const rideRequestStore = new RedisRideRequestStore();
