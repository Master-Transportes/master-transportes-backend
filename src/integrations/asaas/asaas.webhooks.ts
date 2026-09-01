import { z } from "zod";

const WEBHOOK_TOKEN = process.env.ASAAS_WEBHOOK_TOKEN ?? "";

const AsaasWebhookEventSchema = z.object({
  id: z.string().min(1),
  event: z.string().min(1),
  dateCreated: z.string(),
  account: z.object({ id: z.string() }),
  payment: z.object({
    id: z.string(),
    status: z.string(),
    value: z.number(),
    netValue: z.number().optional(),
    externalReference: z.string().optional(),
    billingType: z.string().optional(),
  }),
});

export type AsaasWebhookEventValidated = z.infer<typeof AsaasWebhookEventSchema>;

export function validateWebhookToken(token: string): boolean {
  return token === WEBHOOK_TOKEN && WEBHOOK_TOKEN.length >= 32;
}

export function parseWebhookEvent(body: unknown): AsaasWebhookEventValidated {
  return AsaasWebhookEventSchema.parse(body);
}
