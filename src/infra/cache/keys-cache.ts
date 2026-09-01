import { DRIVER_LOCATION_TTL_SECONDS, DRIVER_HEARTBEAT_TTL_SECONDS } from "@/constants/cache";

export const CACHE_KEYS = {
  USER: (userId: string) => `user:${userId}`,
  USER_BASE: (userId: string) => `user:${userId}:base`,
  DRIVER: (driverId: string) => `driver:${driverId}`,
  DRIVER_BASE: (driverId: string) => `driver:${driverId}:base`,
  USER_SESSIONS: (userId: string) => `user:${userId}:sessions`,
  SESSION: (sessionId: string) => `session:${sessionId}`,
  ACTIVE_RIDE_REQUEST: (userId: string) => `user:${userId}:ride-request`,
  WALLET_BALANCE: (walletId: string) => `wallet:${walletId}:balance`,
};

export const MATCHING_KEYS = {
  DRIVERS_LOCATION: "drivers:location",
  DRIVERS_H3: (cell: string) => `drivers:h3:${cell}`,
  DRIVER_LOCATION: (id: string) => `driver:${id}:location`,
  DRIVER_HEARTBEAT: (id: string) => `driver:${id}:heartbeat`,
} as const;

export const RATE_LIMIT_KEYS = {
  LOGIN: (identifier: string) => `ratelimit:login:${identifier}`,
  REGISTER: (ip: string) => `ratelimit:register:${ip}`,
  REFRESH: (userId: string) => `ratelimit:refresh:${userId}`,
};

export const H3_RESOLUTION = 9;
export const DRIVER_LOCATION_TTL = DRIVER_LOCATION_TTL_SECONDS;
export const DRIVER_HEARTBEAT_TTL = DRIVER_HEARTBEAT_TTL_SECONDS;
