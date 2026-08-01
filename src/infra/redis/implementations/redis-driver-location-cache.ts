import type { IDriverLocationCache } from "@/infra/redis/contracts/IDriverLocationCache";
import { latLngToCell } from "h3-js";
import { redis } from "@/infra/redis/redis-client";
import { metrics } from "@/infra/metrics/metrics";
import { H3_RESOLUTION, MATCHING_KEYS, DRIVER_LOCATION_TTL, DRIVER_HEARTBEAT_TTL } from "@/infra/redis/keys-cache";

export class RedisDriverLocationCache implements IDriverLocationCache {
  async saveLocation(driverId: string, latitude: number, longitude: number): Promise<void> {
    const cell = latLngToCell(latitude, longitude, H3_RESOLUTION);
    const now = Date.now().toString();

    // Obtém o estado atual (célula anterior, status)
    const current = await redis.hgetall(MATCHING_KEYS.DRIVER_LOCATION(driverId));
    const isOnline = current?.status === "available";

    const pipeline = redis.pipeline();

    // Atualiza o hash de localização
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

    // Renova o heartbeat: se os pings pararem, a chave expira e o subscriber remove o motorista dos índices
    pipeline.set(MATCHING_KEYS.DRIVER_HEARTBEAT(driverId), "1", "EX", DRIVER_HEARTBEAT_TTL);

    // Se estiver online, atualiza também o índice geo e H3
    if (isOnline) {
      pipeline.geoadd(MATCHING_KEYS.DRIVERS_LOCATION, longitude, latitude, driverId);

      // Se mudou de célula, remove da antiga
      if (current?.cell && current.cell !== cell) {
        pipeline.srem(MATCHING_KEYS.DRIVERS_H3(current.cell), driverId);
      }
      pipeline.sadd(MATCHING_KEYS.DRIVERS_H3(cell), driverId);
      pipeline.expire(MATCHING_KEYS.DRIVERS_H3(cell), DRIVER_LOCATION_TTL);
    }

    await pipeline.exec();
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

    // Se já estiver online, apenas renova TTLs e garante presença no índice geo/H3
    if (driver?.status === "available") {
      await this._refreshIndexes(driverId, lat, lng, cell);
      return;
    }

    await this._refreshIndexes(driverId, lat, lng, cell, "available");

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
    pipeline.expire(MATCHING_KEYS.DRIVER_LOCATION(driverId), DRIVER_LOCATION_TTL);
    await pipeline.exec();

    metrics.incCounter("driver_go_offline_total");
    metrics.observeHistogram("driver_location_operation_duration_ms", Date.now() - startTime);
  }

  async getStatus(driverId: string): Promise<string | null> {
    return redis.hget(MATCHING_KEYS.DRIVER_LOCATION(driverId), "status");
  }

  /**
   * Garante presença do motorista nos índices geo/H3 e renova os TTLs.
   * Se `status` for informado, atualiza-o no hash (ex.: "available" ao ficar online).
   */
  private async _refreshIndexes(
    driverId: string,
    lat: string,
    lng: string,
    cell: string,
    status?: string,
  ): Promise<void> {
    const pipeline = redis
      .pipeline()
      .geoadd(MATCHING_KEYS.DRIVERS_LOCATION, Number(lng), Number(lat), driverId)
      .sadd(MATCHING_KEYS.DRIVERS_H3(cell), driverId)
      .expire(MATCHING_KEYS.DRIVERS_H3(cell), DRIVER_LOCATION_TTL)
      .expire(MATCHING_KEYS.DRIVER_LOCATION(driverId), DRIVER_LOCATION_TTL);
    if (status) {
      pipeline.hset(MATCHING_KEYS.DRIVER_LOCATION(driverId), "status", status);
    }
    await pipeline.exec();
  }
}

export const driverLocationCache = new RedisDriverLocationCache();
