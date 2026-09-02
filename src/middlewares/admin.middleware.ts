import { APIError, middleware } from "encore.dev/api";
import * as auth from "~encore/auth";
import { clientRepository } from "@/repositories";
import { clientCache } from "@/cache";

export const AdminMiddleware = middleware({ target: { auth: true } }, async (req, next) => {
  const { userID, role } = auth.getAuthData()!;

  if (role && role !== "ADMIN") {
    throw APIError.permissionDenied("Acesso administrativo obrigatório.");
  }

  const cached = await clientCache.getBase(userID);
  if (cached) {
    if (cached.role !== "ADMIN") {
      throw APIError.permissionDenied("Acesso administrativo obrigatório.");
    }
    if (cached.status === "BANNED") {
      throw APIError.permissionDenied("Conta administrativa inativa.");
    }
    return next(req);
  }

  const dbUser = await clientRepository.findById(userID);
  if (!dbUser) {
    throw APIError.notFound("Usuário não encontrado.");
  }

  await clientCache.setBase(userID, { role: dbUser.role, status: dbUser.status });

  if (dbUser.role !== "ADMIN") {
    throw APIError.permissionDenied("Acesso administrativo obrigatório.");
  }

  if (dbUser.status === "BANNED") {
    throw APIError.permissionDenied("Conta administrativa inativa.");
  }

  return next(req);
});
