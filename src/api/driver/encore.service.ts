import { DriverMiddleware } from "@/middlewares/driver.middleware";
import { loginRateLimit, registerRateLimit, refreshRateLimit } from "@/middlewares/rate-limit.middleware";
import { Service } from "encore.dev/service";

export default new Service("driver", {
  middlewares: [DriverMiddleware, loginRateLimit, registerRateLimit, refreshRateLimit],
});
