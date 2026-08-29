import { redis } from "@/infra/cache/redis-client";
import { CACHE_KEYS } from "@/infra/cache/keys-cache";
import { RIDE_REQUEST_LOCK_TTL_SECONDS } from "@/constants/cache";
import type { IRideRequestStore } from "./contracts/IRideRequestStore";

export class RedisRideRequestStore implements IRideRequestStore {
  async lock(passengerId: string, rideId: string): Promise<boolean> {
    const lockKey = CACHE_KEYS.ACTIVE_RIDE_REQUEST(passengerId);
    const result = await redis.set(lockKey, rideId, "EX", RIDE_REQUEST_LOCK_TTL_SECONDS, "NX");
    return result !== null;
  }

  async release(passengerId: string): Promise<void> {
    await redis.del(CACHE_KEYS.ACTIVE_RIDE_REQUEST(passengerId));
  }

  async releaseIfLocked(passengerId: string, rideId: string): Promise<void> {
    const lockedRideId = await this.getLockedRideId(passengerId);
    if (lockedRideId === rideId) {
      await this.release(passengerId);
    }
  }

  async getLockedRideId(passengerId: string): Promise<string | null> {
    const lockKey = CACHE_KEYS.ACTIVE_RIDE_REQUEST(passengerId);
    return redis.get(lockKey);
  }
}

export const rideRequestStore = new RedisRideRequestStore();
