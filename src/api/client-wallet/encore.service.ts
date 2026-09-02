import { ClientMiddleware } from "@/middlewares/client.middleware";
import { Service } from "encore.dev/service";

export default new Service("client-wallet", {
  middlewares: [ClientMiddleware],
});
