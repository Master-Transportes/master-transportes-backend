import "dotenv/config";
import Redis from "ioredis";
import log from "encore.dev/log";

const REDIS_URL = process.env.REDIS_STATE_URL ?? "redis://127.0.0.1:6379";
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

const LOG_THROTTLE_MS = 30_000;

const baseOptions = {
  lazyConnect: true,
  connectTimeout: 30_000,
  keepAlive: 60_000,
  password: REDIS_PASSWORD,
  maxRetriesPerRequest: 5,
  enableReadyCheck: true,
  enableOfflineQueue: false,
  reconnectOnError: (err: Error) => {
    const targetError = "READONLY";
    if (err.message.includes(targetError)) {
      log.warn("Reconnecting on READONLY error", { error: err, component: "redis-client" });
      return true;
    }
    return false;
  },
};

let lastErrorLoggedAt = 0;
let errorCount = 0;
let firstErrorAt: Date | null = null;

export function createRedisClient(): Redis {
  const client = new Redis(REDIS_URL, baseOptions);
  log.info("Creating Redis client", {
    component: "redis-client",
    url: REDIS_URL.replace(/\/\/.*@/, "//***@"),
  });

  client.on("error", (err: Error) => {
    errorCount++;
    if (!firstErrorAt) firstErrorAt = new Date();

    const now = Date.now();
    if (now - lastErrorLoggedAt >= LOG_THROTTLE_MS) {
      const downFor = ((now - firstErrorAt.getTime()) / 1000).toFixed(0);
      log.error(`Redis unreachable for ${downFor}s (${errorCount} attempts)`, {
        error: err,
        component: "redis-client",
      });
      lastErrorLoggedAt = now;
    }
  });

  client.on("connect", () => {
    const downFor = firstErrorAt ? ((Date.now() - firstErrorAt.getTime()) / 1000).toFixed(0) : "0";
    log.info(`Redis connected after ${downFor}s downtime`, { component: "redis-client" });
    firstErrorAt = null;
    errorCount = 0;
    lastErrorLoggedAt = 0;
  });

  client.on("ready", () => {
    log.info("Redis ready", { component: "redis-client" });
  });

  client.on("close", () => {
    log.warn("Redis connection closed", { component: "redis-client" });
  });

  return client;
}

export const redis = createRedisClient();

export async function pingRedis(): Promise<boolean> {
  try {
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}
