import { Service } from "encore.dev/service";
import {
  DRIVER_OPERATIONAL_POLICY,
  createDriverOperationalMiddleware,
} from "@/middlewares/driver-operational.middleware";
import { DriverRoleMiddleware } from "@/middlewares/role.middleware";

// Import dinâmico para manter a definição do serviço leve na análise do Encore;
// o repositório só é carregado quando o middleware operacional for executado.
const DriverOperationalMiddleware = createDriverOperationalMiddleware(async userId => {
  const { driverRepository } = await import("@/repositories");
  return driverRepository.findStatusByUserId(userId);
}, DRIVER_OPERATIONAL_POLICY);

export default new Service("driver", { middlewares: [DriverRoleMiddleware, DriverOperationalMiddleware] });
