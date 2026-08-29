import { createRedisClient } from "@/infra/cache/redis-client";
import { driverLocationCache } from "./driver-location.cache";
import log from "encore.dev/log";

const EXPIRED_CHANNEL = "__keyevent@0__:expired";
const HEARTBEAT_SUFFIX = ":heartbeat";

export async function startDriverCleanupListener(): Promise<void> {
  const subscriber = createRedisClient();

  await subscriber.config("SET", "notify-keyspace-events", "Ex");

  await subscriber.subscribe(EXPIRED_CHANNEL);
  log.info(`Listening for expired keys on ${EXPIRED_CHANNEL}`, {
    component: "expiration-listener",
  });

  subscriber.on("message", (channel, expiredKey) => {
    if (channel !== EXPIRED_CHANNEL || !expiredKey.endsWith(HEARTBEAT_SUFFIX)) return;

    const driverId = expiredKey.slice("driver:".length, -HEARTBEAT_SUFFIX.length);

    driverLocationCache
      .goOffline(driverId)
      .then(() => {
        log.info("Driver removed from indexes (heartbeat expired)", {
          driverId,
          component: "expiration-listener",
        });
      })
      .catch(err => {
        log.error("Failed to cleanup driver after heartbeat expired", {
          error: err,
          driverId,
          component: "expiration-listener",
        });
      });
  });
}

startDriverCleanupListener().catch(err => {
  log.error("Failed to start driver cleanup listener", {
    error: err,
    component: "expiration-listener",
  });
});
