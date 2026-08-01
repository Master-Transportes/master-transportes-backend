export const CACHE_KEYS = {
  USER: (userId: string) => `user:${userId}`, // dados do USUÁRIO CLIENTE
  USER_BASE: (userId: string) => `user:${userId}:base`, // dados do USUÁRIO CLIENTE para o middleware
  DRIVER: (driverId: string) => `driver:${driverId}`, // dados do USUÁRIO MOTORISTA
  DRIVER_BASE: (driverId: string) => `driver:${driverId}:base`, // dados do USUÁRIO MOTORISTA para o middleware
  USER_SESSIONS: (userId: string) => `user:${userId}:sessions`,
  SESSION: (sessionId: string) => `session:${sessionId}`,
  ACTIVE_RIDE_REQUEST: (userId: string) => `user:${userId}:ride-request`,
};

export const MATCHING_KEYS = {
  DRIVERS_LOCATION: "drivers:location",
  DRIVERS_H3: (cell: string) => `drivers:h3:${cell}`,
  DRIVER_LOCATION: (id: string) => `driver:${id}:location`,
} as const;

export const H3_RESOLUTION = 9;
export const DRIVER_LOCATION_TTL = 300;
