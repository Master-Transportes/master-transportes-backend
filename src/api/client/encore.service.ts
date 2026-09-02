import { ClientMiddleware } from "@/middlewares/client.middleware";
import { loginRateLimit, registerRateLimit, refreshRateLimit } from "@/middlewares/rate-limit.middleware";
import { Service } from "encore.dev/service";

export default new Service("client", {
  middlewares: [ClientMiddleware, loginRateLimit, registerRateLimit, refreshRateLimit],
});
