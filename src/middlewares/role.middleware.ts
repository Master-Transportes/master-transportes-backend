import { APIError, middleware } from "encore.dev/api";
import * as auth from "~encore/auth";
import { userCache } from "@/infra/redis";
import { userRepository } from "@/infra/drizzle";
import type { UserStatus, Role } from "@/infra/drizzle/schema";

export interface RoleCacheDTO {
  id: string;
  role: Role;
  status: UserStatus;
}

type LookupFn = (id: string) => Promise<{ role: string; status: string } | null>;

interface RoleMiddlewareOptions {
  role: RoleCacheDTO["role"];
  notFoundMessage: string;
  unauthorizedMessage: string;
  inactiveMessage: string;
  lookupFn?: LookupFn;
}

export const createRoleMiddleware = (options: RoleMiddlewareOptions) =>
  middleware({ target: { auth: true } }, async (req, next) => {
    const { userID } = auth.getAuthData()!;

    const lookup =
      options.lookupFn ??
      ((id: string) => userRepository.findById(id).then(u => (u ? { role: u.role, status: u.status } : null)));

    const cached = await userCache.getBase(userID);
    let user: RoleCacheDTO | null = cached
      ? { id: userID, role: cached.role as RoleCacheDTO["role"], status: cached.status as UserStatus }
      : null;

    if (!user) {
      const dbUser = await lookup(userID);

      if (!dbUser) {
        throw APIError.notFound(options.notFoundMessage);
      }

      user = { id: userID, role: dbUser.role as RoleCacheDTO["role"], status: dbUser.status as UserStatus };
      await userCache.setBase(userID, { role: user.role, status: user.status });
    }

    if (user.role !== options.role) {
      throw APIError.permissionDenied(options.unauthorizedMessage);
    }

    if (user.status !== "ACTIVE") {
      throw APIError.permissionDenied(options.inactiveMessage);
    }

    return next(req);
  });
