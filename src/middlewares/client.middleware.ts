import { createRoleMiddleware } from "./role.middleware";
import { userRepository } from "@/repositories";
import { userCache } from "@/cache";

export const ClientMiddleware = createRoleMiddleware({
  role: "CLIENT",
  notFoundMessage: "Usuário não encontrado",
  unauthorizedMessage: "Usuário não autorizado",
  inactiveMessage: "Usuário inativo",
  lookupFn: id => userRepository.findById(id).then(u => (u ? { role: u.role, status: u.status } : null)),
  cache: userCache,
});
