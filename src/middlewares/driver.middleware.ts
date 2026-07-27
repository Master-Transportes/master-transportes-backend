import { createRoleMiddleware } from "./role.middleware";

export const DriverMiddleware = createRoleMiddleware({
  role: "DRIVER",
  notFoundMessage: "Usuário não encontrado",
  unauthorizedMessage: "Usuário não autorizado",
  inactiveMessage: "Usuário inativo",
});
