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

interface RoleMiddlewareOptions {
  role: RoleCacheDTO["role"];
  notFoundMessage: string;
  unauthorizedMessage: string;
  inactiveMessage: string;
}

export const createRoleMiddleware = (options: RoleMiddlewareOptions) =>
  middleware({ target: { auth: true } }, async (req, next) => {
    const { userID } = auth.getAuthData()!;

    const cached = await redis.get(CACHE_KEYS.USER_BASE(userID));
    let user: RoleCacheDTO | null = cached ? JSON.parse(cached) : null;

    if (!user) {
      const dbUser = await userRepository.findById(userID);

      if (!dbUser) {
        throw APIError.notFound(options.notFoundMessage);
      }

      user = { id: dbUser.id, role: dbUser.role, status: dbUser.status };
      await redis.set(CACHE_KEYS.USER_BASE(userID), JSON.stringify(user), "EX", 600);
    }

    if (user.role !== options.role) {
      throw APIError.permissionDenied(options.unauthorizedMessage);
    }

    if (user.status !== "ACTIVE") {
      throw APIError.permissionDenied(options.inactiveMessage);
    }

    return next(req);
  });
