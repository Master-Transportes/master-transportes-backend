import { redis } from "@/infra/cache/redis-client";

if (redis.status !== "ready") {
  await redis.connect();
}
