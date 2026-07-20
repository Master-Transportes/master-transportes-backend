import { APIError, middleware } from "encore.dev/api";
import * as auth from "~encore/auth";
import { eq } from "drizzle-orm";
import { cache } from "@/infra/cache";
import { drizzleDatabase } from "@/infra/adapters/drizzle-db.adapter";
import { CACHE_KEYS } from "@/infra/cache/keys-cache";
import { users } from "@/infra/db/schema";
import type { UserStatus } from "@/infra/db/schema";

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

    let user = await cache.get<RoleCacheDTO>(CACHE_KEYS.USER_BASE(userID));

    if (!user) {
      const [dbUser] = await drizzleDatabase.db
        .select({ id: users.id, role: users.role, status: users.status })
        .from(users)
        .where(eq(users.id, userID));

      if (!dbUser) {
        throw APIError.notFound(options.notFoundMessage);
      }

      user = dbUser;
      await cache.set(CACHE_KEYS.USER_BASE(userID), user, { ttlSeconds: 600 });
    }

    if (user.role !== options.role) {
      throw APIError.permissionDenied(options.unauthorizedMessage);
    }

    if (user.status !== "ACTIVE") {
      throw APIError.permissionDenied(options.inactiveMessage);
    }

    return next(req);
  });
