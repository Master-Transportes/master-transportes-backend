import { IDriverLocationCache } from "@/contracts/IDriverLocationCache";
import { latLngToCell } from "h3-js";
import { redis } from "./redis-client";
import { metrics } from "../metrics";
import { H3_RESOLUTION, MATCHING_KEYS, DRIVER_LOCATION_TTL } from "./keys-cache";

export class RedisDriverLocationCache implements IDriverLocationCache {
  async updateLocation(driverId: string, latitude: number, longitude: number): Promise<void> {
    const startTime = Date.now();
    const newCell = latLngToCell(latitude, longitude, H3_RESOLUTION);
    const oldCell = await redis.hget(MATCHING_KEYS.DRIVER(driverId), "cell");

    const pipeline = redis.pipeline();

    pipeline.geoadd(MATCHING_KEYS.DRIVERS_LOCATION, longitude, latitude, driverId);
    pipeline.hset(
      MATCHING_KEYS.DRIVER(driverId),
      "cell",
      newCell,
      "status",
      "available",
      "lastLocationUpdate",
      Date.now().toString(),
    );
    pipeline.expire(MATCHING_KEYS.DRIVER(driverId), DRIVER_LOCATION_TTL);

    if (oldCell && oldCell !== newCell) {
      pipeline.srem(MATCHING_KEYS.DRIVERS_H3(oldCell), driverId);
    }

    if (!oldCell || oldCell !== newCell) {
      pipeline.sadd(MATCHING_KEYS.DRIVERS_H3(newCell), driverId);
    }

    await pipeline.exec();

    metrics.incCounter("driver_location_update_total");
    metrics.observeHistogram("driver_location_operation_duration_ms", Date.now() - startTime);
  }
}

export const driverLocationCache = new RedisDriverLocationCache();
