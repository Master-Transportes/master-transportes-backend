import { Service } from "encore.dev/service";
import { DriverRoleMiddleware } from "@/middlewares/driver-role.middleware";

export default new Service("driver", { middlewares: [DriverRoleMiddleware] });
