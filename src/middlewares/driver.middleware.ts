import { APIError, middleware } from "encore.dev/api";
import * as auth from "~encore/auth";
import { driverRepository } from "@/repositories";
import { driverCache } from "@/cache";

export const DriverMiddleware = middleware({ target: { auth: true } }, async (req, next) => {
  const { userID, role } = auth.getAuthData()!;

  if (role && role !== "DRIVER") {
    throw APIError.permissionDenied("Motorista não autorizado.");
  }

  const cached = await driverCache.getBase(userID);
  if (cached) {
    if (cached.role !== "DRIVER") {
      throw APIError.permissionDenied("Motorista não autorizado.");
    }
    if (cached.status === "REJECTED") {
      throw APIError.permissionDenied("Motorista inativo.");
    }
    return next(req);
  }

  const dbDriver = await driverRepository.findByIdWithStatus(userID);
  if (!dbDriver) {
    throw APIError.notFound("Motorista não encontrado.");
  }

  await driverCache.setBase(userID, { role: "DRIVER", status: dbDriver.status });

  if (dbDriver.status === "REJECTED") {
    throw APIError.permissionDenied("Motorista inativo.");
  }

  return next(req);
});
