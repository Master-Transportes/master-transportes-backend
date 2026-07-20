import { AdminMiddleware } from "@/middlewares/admin.middleware";
import { Service } from "encore.dev/service";

export default new Service("dashboard", { middlewares: [AdminMiddleware] });
