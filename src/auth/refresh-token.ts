import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getRefreshTokenSecret } from "@/config/env";

const SEPARATOR = ".";
const RANDOM_BYTES = 32;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Payload autenticado pelo MAC: identificação da sessão + material aleatório. */
function signPayload(payload: string): string {
  return createHmac("sha256", getRefreshTokenSecret()).update(payload).digest("base64url");
}

function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

/**
 * Refresh token = `sessionId.random.MAC`.
 *
 * O sessionId permite localizar a sessão sem varrer o banco; o material
 * aleatório garante imprevisibilidade; o MAC (HMAC-SHA256 com segredo
 * dedicado) prova que o token foi emitido por nós. Assim um token antigo
 * autêntico pode ser distinguido de um token forjado com sessionId conhecido.
 */
export function generateRefreshToken(sessionId: string): string {
  const randomPart = randomBytes(RANDOM_BYTES).toString("base64url");
  const payload = `${sessionId}${SEPARATOR}${randomPart}`;
  return `${payload}${SEPARATOR}${signPayload(payload)}`;
}

export interface ParsedRefreshToken {
  sessionId: string;
  /** false = estrutura válida, mas MAC inválido (token forjado). */
  signatureValid: boolean;
}

export function parseRefreshToken(token: string): ParsedRefreshToken | null {
  const parts = token.split(SEPARATOR);
  if (parts.length !== 3) return null;

  const [sessionId, randomPart, mac] = parts;
  if (!isUuid(sessionId) || randomPart.length < 32 || mac.length < 32) return null;

  const expectedMac = signPayload(`${sessionId}${SEPARATOR}${randomPart}`);
  const provided = Buffer.from(mac, "utf8");
  const expected = Buffer.from(expectedMac, "utf8");

  if (provided.length !== expected.length) {
    return { sessionId, signatureValid: false };
  }

  return { sessionId, signatureValid: timingSafeEqual(provided, expected) };
}

/** Hash persistido em sessions.refresh_token_hash (SHA-256 hex, 64 chars). */
export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
