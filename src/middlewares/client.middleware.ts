import { createRoleMiddleware, RoleCacheDTO } from "./role.middleware";

export interface ClientCacheDTO extends RoleCacheDTO {}

export const ClientMiddleware = createRoleMiddleware({
  role: "CLIENT",
  notFoundMessage: "Usuário não encontrado",
  unauthorizedMessage: "Usuário não autorizado",
  inactiveMessage: "Usuário inativo",
});
