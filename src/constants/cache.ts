export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
export const SESSION_CACHE_TTL_SECONDS = 15 * 60;
export const PROFILE_CACHE_TTL_SECONDS = 600;
export const RIDE_REQUEST_LOCK_TTL_SECONDS = 600;
export const WALLET_BALANCE_CACHE_TTL_SECONDS = 60;
export const DRIVER_LOCATION_TTL_SECONDS = 300;
export const DRIVER_HEARTBEAT_TTL_SECONDS = 60;

const JITTER_PERCENT = 0.05;
const isTest = process.env.NODE_ENV === "test";

export function withJitter(baseTtl: number): number {
  if (isTest) return baseTtl;
  if (baseTtl <= 0) return 60;
  const jitter = Math.floor(baseTtl * JITTER_PERCENT * (Math.random() * 2 - 1));
  return Math.max(baseTtl + jitter, 60);
}
