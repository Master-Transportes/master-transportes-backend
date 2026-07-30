import { APIError, middleware } from "encore.dev/api";
import * as auth from "~encore/auth";
import type { IBaseCache } from "@/infra/redis/contracts/IBaseCache";

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
    const { userID } = auth.getAuthData()!;

    const cached = await options.cache.getBase(userID);
    if (cached) {
      if (cached.role !== options.role) {
        throw APIError.permissionDenied(options.unauthorizedMessage);
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

    return next(req);
  });
