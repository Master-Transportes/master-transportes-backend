import { createRedisClient } from "./redis-client";
import { driverLocationCache } from "./implementations/redis-driver-location-cache";
import { logger } from "@/infra/observability/logger";

const EXPIRED_CHANNEL = "__keyevent@0__:expired";
const HEARTBEAT_SUFFIX = ":heartbeat";

export async function startDriverCleanupListener(): Promise<void> {
  const subscriber = createRedisClient();

  await subscriber.config("SET", "notify-keyspace-events", "Ex");

  await subscriber.subscribe(EXPIRED_CHANNEL);
  logger.info(`Listening for expired keys on ${EXPIRED_CHANNEL}`, {
    component: "expiration-listener",
  });

  subscriber.on("message", (channel, expiredKey) => {
    if (channel !== EXPIRED_CHANNEL || !expiredKey.endsWith(HEARTBEAT_SUFFIX)) return;

    const driverId = expiredKey.slice("driver:".length, -HEARTBEAT_SUFFIX.length);

    driverLocationCache
      .goOffline(driverId)
      .then(() => {
        logger.info("Driver removed from indexes (heartbeat expired)", {
          driverId,
          component: "expiration-listener",
        });
      })
      .catch(err => {
        logger.error("Failed to cleanup driver after heartbeat expired", err, {
          driverId,
          component: "expiration-listener",
        });
      });
  });
}

startDriverCleanupListener().catch(err => {
  logger.error("Failed to start driver cleanup listener", err, {
    component: "expiration-listener",
  });
});
