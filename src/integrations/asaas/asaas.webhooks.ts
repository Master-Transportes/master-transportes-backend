import { timingSafeEqual } from "crypto";

const WEBHOOK_TOKEN = process.env.ASAAS_WEBHOOK_TOKEN ?? "";

export function validateWebhookToken(token: string): boolean {
  if (WEBHOOK_TOKEN.length < 32) return false;
  const tokenBuf = Buffer.from(token, "utf8");
  const expectedBuf = Buffer.from(WEBHOOK_TOKEN, "utf8");
  if (tokenBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(tokenBuf, expectedBuf);
}
