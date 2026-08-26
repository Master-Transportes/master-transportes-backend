import { createRoleMiddleware } from "./role.middleware";
import { driverRepository } from "@/infra/drizzle";
import { driverCache } from "@/infra/redis";

export const DriverMiddleware = createRoleMiddleware({
  role: "DRIVER",
  notFoundMessage: "Motorista não encontrado",
  unauthorizedMessage: "Motorista não autorizado",
  inactiveMessage: "Motorista inativo",
  lookupFn: async id => {
    const result = await driverRepository.findByIdWithStatus(id);
    return result ? { role: "DRIVER", status: result.status } : null;
  },
  cache: driverCache,
});
