import { Service } from "encore.dev/service";
import { ClientRoleMiddleware } from "@/middlewares/client-role.middleware";

export default new Service("client", { middlewares: [ClientRoleMiddleware] });
