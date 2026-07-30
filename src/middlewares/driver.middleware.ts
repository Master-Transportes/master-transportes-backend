import { createRoleMiddleware } from "./role.middleware";
import { driverRepository } from "@/infra/postgres";

export const DriverMiddleware = createRoleMiddleware({
  role: "DRIVER",
  notFoundMessage: "Motorista não encontrado",
  unauthorizedMessage: "Motorista não autorizado",
  inactiveMessage: "Motorista inativo",
  lookupFn: (id) => driverRepository.findByIdWithStatus(id),
});
