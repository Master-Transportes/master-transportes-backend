import { createRoleMiddleware, RoleCacheDTO } from "./role.middleware";

export interface DriverCacheDTO extends RoleCacheDTO {}

export const DriverMiddleware = createRoleMiddleware({
  role: "DRIVER",
  notFoundMessage: "Usuário não encontrado",
  unauthorizedMessage: "Usuário não autorizado",
  inactiveMessage: "Usuário inativo",
});
