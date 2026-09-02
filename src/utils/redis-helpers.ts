import type { Redis, ChainableCommander } from "ioredis";
import type { z } from "zod";
import log from "encore.dev/log";

export function safeJsonParse<T>(data: string | null, schema: z.ZodType<T>): T | null {
  if (!data) return null;
  try {
    return schema.parse(JSON.parse(data));
  } catch (err) {
    log.warn("Failed to parse Redis cache data", { error: err });
    return null;
  }
}

export async function execPipelineSettled(pipeline: ChainableCommander): Promise<void> {
  const results = (await pipeline.exec()) ?? [];
  results.forEach(([err], index) => {
    if (err) {
      log.warn(`Redis pipeline command ${index} failed`, { error: err });
    }
  });
}

export async function smembersSafe(redis: Redis, key: string, max = 100): Promise<string[]> {
  const result: string[] = [];
  let cursor = "0";
  do {
    const [nextCursor, members] = await redis.sscan(key, cursor, "COUNT", 10);
    cursor = nextCursor;
    result.push(...members);
    if (result.length >= max) break;
  } while (cursor !== "0");
  return result;
}
