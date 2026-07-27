import { createRoleMiddleware } from "./role.middleware";

export const ClientMiddleware = createRoleMiddleware({
  role: "CLIENT",
  notFoundMessage: "Usuário não encontrado",
  unauthorizedMessage: "Usuário não autorizado",
  inactiveMessage: "Usuário inativo",
});
