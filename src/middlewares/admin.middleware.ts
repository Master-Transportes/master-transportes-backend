import { createRoleMiddleware } from "./role.middleware";
import { userRepository } from "@/repositories";
import { userCache } from "@/cache";

export const AdminMiddleware = createRoleMiddleware({
  role: "ADMIN",
  notFoundMessage: "Usuário não encontrado.",
  unauthorizedMessage: "Acesso administrativo obrigatório.",
  inactiveMessage: "Conta administrativa inativa.",
  lookupFn: id => userRepository.findById(id).then(u => (u ? { role: u.role, status: u.status } : null)),
  cache: userCache,
});
