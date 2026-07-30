export const CACHE_KEYS = {
  USER: (userId: string) => `user:${userId}`,
  USER_BASE: (userId: string) => `user:${userId}:base`,
  DRIVER_BASE: (driverId: string) => `driver:${driverId}:base`,
  USER_SESSIONS: (userId: string) => `user:${userId}:sessions`,
  SESSION: (sessionId: string) => `session:${sessionId}`,
  ACTIVE_RIDE_REQUEST: (userId: string) => `user:${userId}:ride-request`,
};

export const MATCHING_KEYS = {
  DRIVERS_LOCATION: "drivers:location",
  DRIVERS_H3: (cell: string) => `drivers:h3:${cell}`,
  DRIVER: (id: string) => `driver:${id}`,
} as const;

export const H3_RESOLUTION = 9;
export const DRIVER_LOCATION_TTL = 300;
