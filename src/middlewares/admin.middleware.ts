import { createRoleMiddleware } from "./role.middleware";

export const AdminMiddleware = createRoleMiddleware({
  role: "ADMIN",
  notFoundMessage: "Usuário não encontrado.",
  unauthorizedMessage: "Acesso administrativo obrigatório.",
  inactiveMessage: "Conta administrativa inativa.",
});
