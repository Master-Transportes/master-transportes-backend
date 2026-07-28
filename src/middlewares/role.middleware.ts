import { APIError, middleware } from "encore.dev/api";
import * as auth from "~encore/auth";
import { redis } from "@/infra/cache/redis-client";
import { CACHE_KEYS } from "@/infra/cache/keys-cache";
import { userRepository } from "@/repositories/user.repository";
import type { UserStatus } from "@/interfaces/user-types";

export interface RoleCacheDTO {
  id: string;
  role: "DRIVER" | "CLIENT" | "ADMIN" | "EMPLOYEE";
  status: UserStatus;
}

type LookupFn = (id: string) => Promise<{ role: string; status: string } | null>;

interface RoleMiddlewareOptions {
  role: RoleCacheDTO["role"];
  notFoundMessage: string;
  unauthorizedMessage: string;
  inactiveMessage: string;
  lookupFn?: LookupFn;
  cacheKeyFn?: (id: string) => string;
}

export const createRoleMiddleware = (options: RoleMiddlewareOptions) =>
  middleware({ target: { auth: true } }, async (req, next) => {
    const { userID } = auth.getAuthData()!;

    const cacheKey = options.cacheKeyFn ? options.cacheKeyFn(userID) : CACHE_KEYS.USER_BASE(userID);
    const lookup = options.lookupFn ?? ((id: string) => userRepository.findById(id).then(u => u ? { role: u.role, status: u.status } : null));

    const cached = await redis.get(cacheKey);
    let user: RoleCacheDTO | null = cached ? JSON.parse(cached) : null;

    if (!user) {
      const dbUser = await lookup(userID);

      if (!dbUser) {
        throw APIError.notFound(options.notFoundMessage);
      }

      user = { id: userID, role: dbUser.role as RoleCacheDTO["role"], status: dbUser.status as UserStatus };
      await redis.set(cacheKey, JSON.stringify(user), "EX", 600);
    }

    if (user.role !== options.role) {
      throw APIError.permissionDenied(options.unauthorizedMessage);
    }

    if (user.status !== "ACTIVE") {
      throw APIError.permissionDenied(options.inactiveMessage);
    }

    return next(req);
  });
