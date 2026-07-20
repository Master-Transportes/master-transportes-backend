export const CACHE_KEYS = {
  USER: (userId: string) => `user:${userId}`,
  USER_BASE: (userId: string) => `user:${userId}:base`,
  USER_SESSIONS: (userId: string) => `user:${userId}:sessions`,
  SESSION: (sessionId: string) => `session:${sessionId}`,
};
