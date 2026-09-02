import { APIError, middleware } from "encore.dev/api";
import * as auth from "~encore/auth";
import { clientRepository } from "@/repositories";
import { clientCache } from "@/cache";

export const ClientMiddleware = middleware({ target: { auth: true } }, async (req, next) => {
  const { userID, role } = auth.getAuthData()!;

  if (role && role !== "CLIENT") {
    throw APIError.permissionDenied("Usuário não autorizado.");
  }

  const cached = await clientCache.getBase(userID);
  if (cached) {
    if (cached.role !== "CLIENT") {
      throw APIError.permissionDenied("Usuário não autorizado.");
    }
    if (cached.status === "BANNED") {
      throw APIError.permissionDenied("Usuário inativo.");
    }
    return next(req);
  }

  const dbUser = await clientRepository.findById(userID);
  if (!dbUser) {
    throw APIError.notFound("Usuário não encontrado.");
  }

  await clientCache.setBase(userID, { role: dbUser.role, status: dbUser.status });

  if (dbUser.role !== "CLIENT") {
    throw APIError.permissionDenied("Usuário não autorizado.");
  }

  if (dbUser.status === "BANNED") {
    throw APIError.permissionDenied("Usuário inativo.");
  }

  return next(req);
});
