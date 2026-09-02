import { redis } from "@/infra/cache/redis-client";
import { CACHE_KEYS } from "@/infra/cache/keys-cache";
import { RIDE_REQUEST_LOCK_TTL_SECONDS } from "@/constants/cache";
import log from "encore.dev/log";
import type { IRideRequestStore } from "./contracts/IRideRequestStore";

export class RedisRideRequestStore implements IRideRequestStore {
  async lock(passengerId: string, rideId: string): Promise<boolean> {
    try {
      const lockKey = CACHE_KEYS.ACTIVE_RIDE_REQUEST(passengerId);
      const result = await redis.set(lockKey, rideId, "EX", RIDE_REQUEST_LOCK_TTL_SECONDS, "NX");
      return result !== null;
    } catch (err) {
      log.warn("Redis lock failed", { error: err, passengerId, rideId, component: "ride-request-store" });
      return false;
    }
  }

  async release(passengerId: string): Promise<void> {
    try {
      await redis.del(CACHE_KEYS.ACTIVE_RIDE_REQUEST(passengerId));
    } catch (err) {
      log.warn("Redis release failed", { error: err, passengerId, component: "ride-request-store" });
    }
  }

  async releaseIfLocked(passengerId: string, rideId: string): Promise<void> {
    try {
      const lockedRideId = await this.getLockedRideId(passengerId);
      if (lockedRideId === rideId) {
        await this.release(passengerId);
      }
    } catch (err) {
      log.warn("Redis releaseIfLocked failed", { error: err, passengerId, rideId, component: "ride-request-store" });
    }
  }

  async getLockedRideId(passengerId: string): Promise<string | null> {
    try {
      const lockKey = CACHE_KEYS.ACTIVE_RIDE_REQUEST(passengerId);
      return await redis.get(lockKey);
    } catch (err) {
      log.warn("Redis getLockedRideId failed", { error: err, passengerId, component: "ride-request-store" });
      return null;
    }
  }
}

export const rideRequestStore = new RedisRideRequestStore();
