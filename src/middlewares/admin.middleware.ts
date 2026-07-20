import { createRoleMiddleware, RoleCacheDTO } from "./role.middleware";

export interface AdminCacheDTO extends RoleCacheDTO {}

export const AdminMiddleware = createRoleMiddleware({
  role: "ADMIN",
  notFoundMessage: "Usuário não encontrado.",
  unauthorizedMessage: "Acesso administrativo obrigatório.",
  inactiveMessage: "Conta administrativa inativa.",
});
