import { Service } from "encore.dev/service";
import { AsaasWebhookMiddleware } from "@/middlewares/asaas-webhook.middleware";

export default new Service("webhooks", {
  middlewares: [AsaasWebhookMiddleware],
});
