import { DriverMiddleware } from "@/middlewares/driver.middleware";
import { Service } from "encore.dev/service";

export default new Service("driver", { middlewares: [DriverMiddleware] });
