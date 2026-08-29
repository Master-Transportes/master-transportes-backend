import { APIError, middleware } from "encore.dev/api";
import * as auth from "~encore/auth";
import type { IBaseCache } from "@/cache/contracts/IBaseCache";

type LookupFn = (id: string) => Promise<{ role: string; status: string } | null>;

interface RoleMiddlewareOptions {
  role: string;
  notFoundMessage: string;
  unauthorizedMessage: string;
  inactiveMessage: string;
  lookupFn: LookupFn;
  cache: IBaseCache;
}

export const createRoleMiddleware = (options: RoleMiddlewareOptions) =>
  middleware({ target: { auth: true } }, async (req, next) => {
    const { userID, role } = auth.getAuthData()!;

    if (role && role !== options.role) {
      throw APIError.permissionDenied(options.unauthorizedMessage);
    }

    const cached = await options.cache.getBase(userID);
    if (cached) {
      if (cached.role !== options.role) {
        throw APIError.permissionDenied(options.unauthorizedMessage);
      }
      if (cached.status !== "ACTIVE") {
        throw APIError.permissionDenied(options.inactiveMessage);
      }
      return next(req);
    }

    const dbUser = await options.lookupFn(userID);
    if (!dbUser) {
      throw APIError.notFound(options.notFoundMessage);
    }

    await options.cache.setBase(userID, { role: dbUser.role, status: dbUser.status });

    if (dbUser.role !== options.role) {
      throw APIError.permissionDenied(options.unauthorizedMessage);
    }

    if (dbUser.status !== "ACTIVE") {
      throw APIError.permissionDenied(options.inactiveMessage);
    }

    return next(req);
  });
