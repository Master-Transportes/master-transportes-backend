export const RATE_LIMITS = {
  LOGIN: {
    key: "ratelimit:login",
    limit: 7,
    windowSeconds: 10 * 60,
  },
  REGISTER: {
    key: "ratelimit:register",
    limit: 6,
    windowSeconds: 60 * 60,
  },
  REFRESH: {
    key: "ratelimit:refresh",
    limit: 10,
    windowSeconds: 15 * 60,
  },
} as const;

export type RateLimitAction = keyof typeof RATE_LIMITS;
