import type { IDriverLocationCache } from "@/infra/redis/contracts/IDriverLocationCache";
import { latLngToCell } from "h3-js";
import { redis } from "@/infra/redis/redis-client";
import { metrics } from "@/infra/metrics/metrics";
import { H3_RESOLUTION, MATCHING_KEYS, DRIVER_LOCATION_TTL } from "@/infra/redis/keys-cache";

export class RedisDriverLocationCache implements IDriverLocationCache {
  async saveLocation(driverId: string, latitude: number, longitude: number): Promise<void> {
    const cell = latLngToCell(latitude, longitude, H3_RESOLUTION);
    const now = Date.now().toString();

    await redis
      .pipeline()
      .hset(
        MATCHING_KEYS.DRIVER_LOCATION(driverId),
        "lastLat", latitude.toString(),
        "lastLng", longitude.toString(),
        "cell", cell,
        "lastLocationUpdate", now,
      )
      .expire(MATCHING_KEYS.DRIVER_LOCATION(driverId), DRIVER_LOCATION_TTL)
      .exec();

    metrics.incCounter("driver_location_save_total");
  }

  async goOnline(driverId: string): Promise<void> {
    const startTime = Date.now();
    const driver = await redis.hgetall(MATCHING_KEYS.DRIVER_LOCATION(driverId));
    const lat = driver?.lastLat;
    const lng = driver?.lastLng;
    const cell = driver?.cell;

    if (!lat || !lng || !cell) {
      console.warn(`[driver-location-cache] goOnline: driver ${driverId} sem localização salva`);
      return;
    }

    await redis
      .pipeline()
      .geoadd(MATCHING_KEYS.DRIVERS_LOCATION, Number(lng), Number(lat), driverId)
      .sadd(MATCHING_KEYS.DRIVERS_H3(cell), driverId)
      .hset(MATCHING_KEYS.DRIVER_LOCATION(driverId), "status", "available")
      .expire(MATCHING_KEYS.DRIVER_LOCATION(driverId), DRIVER_LOCATION_TTL)
      .exec();

    metrics.incCounter("driver_go_online_total");
    metrics.observeHistogram("driver_location_operation_duration_ms", Date.now() - startTime);
  }

  async goOffline(driverId: string): Promise<void> {
    const startTime = Date.now();
    const cell = await redis.hget(MATCHING_KEYS.DRIVER_LOCATION(driverId), "cell");

    const pipeline = redis.pipeline();
    pipeline.zrem(MATCHING_KEYS.DRIVERS_LOCATION, driverId);
    if (cell) {
      pipeline.srem(MATCHING_KEYS.DRIVERS_H3(cell), driverId);
    }
    pipeline.hset(MATCHING_KEYS.DRIVER_LOCATION(driverId), "status", "offline");
    await pipeline.exec();

    metrics.incCounter("driver_go_offline_total");
    metrics.observeHistogram("driver_location_operation_duration_ms", Date.now() - startTime);
  }
}

export const driverLocationCache = new RedisDriverLocationCache();
