import { api } from "encore.dev/api";
import type { IncomingMessage, ServerResponse } from "http";
import { paymentService } from "@/services/payment.service";

export const handleAsaasWebhook = api.raw(
  { expose: true, method: "POST", path: "/webhooks/asaas", auth: false },
  async (req: IncomingMessage, resp: ServerResponse) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const body = JSON.parse(Buffer.concat(chunks).toString());

      const token = (req.headers["asaas-access-token"] as string) ?? "";

      await paymentService.processWebhook(body, token);

      resp.writeHead(200, { "Content-Type": "application/json" });
      resp.end(JSON.stringify({ received: true }));
    } catch (err: unknown) {
      if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "unauthenticated") {
        resp.writeHead(401, { "Content-Type": "application/json" });
        resp.end(JSON.stringify({ error: "Token de webhook inválido." }));
        return;
      }
      resp.writeHead(200, { "Content-Type": "application/json" });
      resp.end(JSON.stringify({ received: true }));
    }
  },
);
