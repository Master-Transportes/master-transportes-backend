import "dotenv/config";
import Redis from "ioredis";
import log from "encore.dev/log";

const REDIS_URL = process.env.REDIS_STATE_URL ?? "redis://127.0.0.1:6379";

const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

const baseOptions = {
  lazyConnect: true,
  connectTimeout: 30_000,
  keepAlive: 60_000,
  password: REDIS_PASSWORD,
  maxRetriesPerRequest: 5,
  enableReadyCheck: true,
};

export function createRedisClient(): Redis {
  const client = new Redis(REDIS_URL, baseOptions);
  log.info("Creating Redis client", {
    component: "redis-client",
    url: REDIS_URL.replace(/\/\/.*@/, "//***@"),
  });

  client.on("error", (err: Error) => {
    log.error("Redis error", { error: err, component: "redis-client" });
  });

  client.on("connect", () => {
    log.info("Redis connected", { component: "redis-client" });
  });

  client.on("ready", () => {
    log.info("Redis ready", { component: "redis-client" });
  });

  client.on("close", () => {
    log.warn("Redis connection closed", { component: "redis-client" });
  });

  client.on("reconnecting", () => {
    log.warn("Redis reconnecting", { component: "redis-client" });
  });

  return client;
}

export const redis = createRedisClient();
