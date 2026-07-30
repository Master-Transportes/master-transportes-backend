import { createRoleMiddleware } from "./role.middleware";
import { userRepository } from "@/infra/drizzle";
import { userCache } from "@/infra/redis";

export const AdminMiddleware = createRoleMiddleware({
  role: "ADMIN",
  notFoundMessage: "Usuário não encontrado.",
  unauthorizedMessage: "Acesso administrativo obrigatório.",
  inactiveMessage: "Conta administrativa inativa.",
  lookupFn: id => userRepository.findById(id).then(u => (u ? { role: u.role, status: u.status } : null)),
  cache: userCache,
});
