import { createRoleMiddleware } from "./role.middleware";
import { driverRepository } from "@/repositories/driver.repository";
import { CACHE_KEYS } from "@/infra/cache/keys-cache";

export const DriverMiddleware = createRoleMiddleware({
  role: "DRIVER",
  notFoundMessage: "Motorista não encontrado",
  unauthorizedMessage: "Motorista não autorizado",
  inactiveMessage: "Motorista inativo",
  lookupFn: (id) => driverRepository.findByIdWithStatus(id),
  cacheKeyFn: CACHE_KEYS.DRIVER_BASE,
});
