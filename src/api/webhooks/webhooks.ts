import { api } from "encore.dev/api";
import { paymentService } from "@/services/payment.service";
import type { AsaasWebhookEvent } from "@/integrations/asaas/asaas.webhook-types";
import type { WebhookResponse } from "@/dto/payment.interface";

export const handleAsaasWebhook = api<AsaasWebhookEvent, WebhookResponse>(
  { expose: true, method: "POST", path: "/webhooks/asaas", auth: false },
  async body => {
    await paymentService.processWebhook(body);
    return { received: true };
  },
);
