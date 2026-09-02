import { APICallMeta, currentRequest } from "encore.dev";
import { APIError, middleware } from "encore.dev/api";
import { redis } from "@/infra/cache";
import { RATE_LIMITS, type RateLimitAction } from "@/constants/rate-limit";
import log from "encore.dev/log";

const CIRCUIT_TIMEOUT_MS = 30_000;
const FAILURE_THRESHOLD = 3;

let circuitOpen = false;
let circuitOpenSince: Date | null = null;
let consecutiveFailures = 0;

function getHeaderValue(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length > 0) return value[0];
  return undefined;
}

export function extractIp(meta: APICallMeta): string {
  const realIp = getHeaderValue(meta.headers["x-real-ip"]);
  if (realIp) return realIp.trim();
  const forwarded = getHeaderValue(meta.headers["x-forwarded-for"]);
  if (forwarded) return forwarded.split(",")[0].trim();
  return "local";
}

export function extractUserAgent(meta: APICallMeta): string | undefined {
  return getHeaderValue(meta.headers["user-agent"]);
}

export function getRequestMetadata(): { ipAddress: string; userAgent: string } {
  const callMeta = currentRequest() as APICallMeta;
  return {
    ipAddress: extractIp(callMeta),
    userAgent: extractUserAgent(callMeta) ?? "unknown",
  };
}

interface RateLimitMiddlewareOptions {
  action: RateLimitAction;
  resolveIdentifier: (meta: APICallMeta) => string;
}

export const createRateLimitMiddleware = (options: RateLimitMiddlewareOptions) =>
  middleware({ target: { auth: false } }, async (req, next) => {
    if (circuitOpen) {
      if (Date.now() - circuitOpenSince!.getTime() > CIRCUIT_TIMEOUT_MS) {
        circuitOpen = false;
        circuitOpenSince = null;
        consecutiveFailures = 0;
      } else {
        return next(req);
      }
    }

    const meta = req.requestMeta as APICallMeta;
    const identifier = options.resolveIdentifier(meta);
    const config = RATE_LIMITS[options.action];
    const key = `${config.key}:${identifier}`;

    try {
      const current = await redis.incr(key);
      if (current === 1) {
        await redis.expire(key, config.windowSeconds);
      }

      if (current > config.limit) {
        throw APIError.resourceExhausted("Limite de requisições excedido. Tente novamente mais tarde.");
      }

      consecutiveFailures = 0;
      return next(req);
    } catch (err) {
      if (err instanceof APIError) throw err;

      consecutiveFailures++;
      if (consecutiveFailures >= FAILURE_THRESHOLD) {
        circuitOpen = true;
        circuitOpenSince = new Date();
        log.warn("Rate limit circuit OPEN (Redis unavailable)");
      }
      return next(req);
    }
  });

export const loginRateLimit = createRateLimitMiddleware({
  action: "LOGIN",
  resolveIdentifier: meta => extractIp(meta),
});

export const registerRateLimit = createRateLimitMiddleware({
  action: "REGISTER",
  resolveIdentifier: meta => extractIp(meta),
});

export const refreshRateLimit = createRateLimitMiddleware({
  action: "REFRESH",
  resolveIdentifier: meta => extractIp(meta),
});
