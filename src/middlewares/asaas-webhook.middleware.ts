import { APIError, middleware } from "encore.dev/api";
import { currentRequest, APICallMeta } from "encore.dev";
import { validateWebhookToken } from "@/integrations/asaas/asaas.webhooks";

function getHeader(name: string): string | undefined {
  const meta = currentRequest() as APICallMeta;
  const value = meta.headers[name];
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length > 0) return value[0];
  return undefined;
}

export const AsaasWebhookMiddleware = middleware({ target: { auth: false } }, async (req, next) => {
  const token = getHeader("asaas-access-token") ?? "";

  if (!validateWebhookToken(token)) {
    throw APIError.unauthenticated("Token de webhook inválido.");
  }

  return next(req);
});
