import type { IDriverLocationCache } from "./contracts/IDriverLocationCache";
import { latLngToCell } from "h3-js";
import { redis } from "@/infra/cache/redis-client";
import log from "encore.dev/log";
import { execPipelineSettled } from "@/utils/redis-helpers";
import { H3_RESOLUTION, MATCHING_KEYS, DRIVER_LOCATION_TTL, DRIVER_HEARTBEAT_TTL } from "@/infra/cache/keys-cache";

export class RedisDriverLocationCache implements IDriverLocationCache {
  async saveLocation(driverId: string, latitude: number, longitude: number): Promise<void> {
    try {
      const cell = latLngToCell(latitude, longitude, H3_RESOLUTION);
      const now = Date.now().toString();

      const current = await redis.hgetall(MATCHING_KEYS.DRIVER_LOCATION(driverId));
      const isOnline = current?.status === "available";

      const pipeline = redis.pipeline();

      pipeline.hset(
        MATCHING_KEYS.DRIVER_LOCATION(driverId),
        "lastLat",
        latitude.toString(),
        "lastLng",
        longitude.toString(),
        "cell",
        cell,
        "lastLocationUpdate",
        now,
      );
      pipeline.expire(MATCHING_KEYS.DRIVER_LOCATION(driverId), DRIVER_LOCATION_TTL);

      pipeline.set(MATCHING_KEYS.DRIVER_HEARTBEAT(driverId), "1", "EX", DRIVER_HEARTBEAT_TTL);

      if (isOnline) {
        pipeline.geoadd(MATCHING_KEYS.DRIVERS_LOCATION, longitude, latitude, driverId);

        if (current?.cell && current.cell !== cell) {
          pipeline.srem(MATCHING_KEYS.DRIVERS_H3(current.cell), driverId);
        }
        pipeline.sadd(MATCHING_KEYS.DRIVERS_H3(cell), driverId);
        pipeline.expire(MATCHING_KEYS.DRIVERS_H3(cell), DRIVER_LOCATION_TTL);
      }

      await execPipelineSettled(pipeline);
    } catch (err) {
      log.warn("Redis saveLocation failed", { error: err, driverId, component: "driver-location-cache" });
    }
  }

  async goOnline(driverId: string): Promise<void> {
    try {
      const driver = await redis.hgetall(MATCHING_KEYS.DRIVER_LOCATION(driverId));
      const lat = driver?.lastLat;
      const lng = driver?.lastLng;
      const cell = driver?.cell;

      if (!lat || !lng || !cell) {
        log.warn("goOnline: driver without saved location", { driverId, component: "driver-location-cache" });
        return;
      }

      if (driver?.status === "available") {
        await this._refreshIndexes(driverId, lat, lng, cell);
        return;
      }

      await this._refreshIndexes(driverId, lat, lng, cell, "available");
    } catch (err) {
      log.warn("Redis goOnline failed", { error: err, driverId, component: "driver-location-cache" });
    }
  }

  async goOffline(driverId: string): Promise<void> {
    try {
      const cell = await redis.hget(MATCHING_KEYS.DRIVER_LOCATION(driverId), "cell");

      const pipeline = redis.pipeline();
      pipeline.zrem(MATCHING_KEYS.DRIVERS_LOCATION, driverId);
      if (cell) {
        pipeline.srem(MATCHING_KEYS.DRIVERS_H3(cell), driverId);
      }
      pipeline.hset(MATCHING_KEYS.DRIVER_LOCATION(driverId), "status", "offline");
      pipeline.expire(MATCHING_KEYS.DRIVER_LOCATION(driverId), DRIVER_LOCATION_TTL);
      await execPipelineSettled(pipeline);
    } catch (err) {
      log.warn("Redis goOffline failed", { error: err, driverId, component: "driver-location-cache" });
    }
  }

  async getStatus(driverId: string): Promise<string | null> {
    try {
      return await redis.hget(MATCHING_KEYS.DRIVER_LOCATION(driverId), "status");
    } catch (err) {
      log.warn("Redis getStatus failed", { error: err, driverId, component: "driver-location-cache" });
      return null;
    }
  }

  private async _refreshIndexes(
    driverId: string,
    lat: string,
    lng: string,
    cell: string,
    status?: string,
  ): Promise<void> {
    try {
      const pipeline = redis.pipeline();
      pipeline.geoadd(MATCHING_KEYS.DRIVERS_LOCATION, Number(lng), Number(lat), driverId);
      pipeline.sadd(MATCHING_KEYS.DRIVERS_H3(cell), driverId);
      pipeline.expire(MATCHING_KEYS.DRIVERS_H3(cell), DRIVER_LOCATION_TTL);
      pipeline.expire(MATCHING_KEYS.DRIVER_LOCATION(driverId), DRIVER_LOCATION_TTL);
      if (status) {
        pipeline.hset(MATCHING_KEYS.DRIVER_LOCATION(driverId), "status", status);
      }
      await execPipelineSettled(pipeline);
    } catch (err) {
      log.warn("Redis refreshIndexes failed", { error: err, driverId, component: "driver-location-cache" });
    }
  }
}

export const driverLocationCache = new RedisDriverLocationCache();
