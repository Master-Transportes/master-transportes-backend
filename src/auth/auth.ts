import { SignJWT, jwtVerify } from "jose";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  JWT_ALGORITHM,
  JWT_AUDIENCE,
  JWT_CLOCK_TOLERANCE_SECONDS,
  JWT_ISSUER,
} from "@/constants/auth";
import { getJwtSecret } from "@/config/env";
import type { AccessTokenInput, VerifiedAccessToken } from "./auth.types";

export function getJwtSecretKey(): Uint8Array {
  return new TextEncoder().encode(getJwtSecret());
}

/** Emite o access token JWT (HS256) com os claims exigidos. */
export async function signAccessToken(input: AccessTokenInput): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);

  return new SignJWT({ sid: input.sessionId })
    .setProtectedHeader({ alg: JWT_ALGORITHM, typ: "JWT" })
    .setSubject(input.subject)
    .setJti(input.tokenId)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ACCESS_TOKEN_TTL_SECONDS)
    .sign(getJwtSecretKey());
}

/**
 * Verifica assinatura, issuer, audience e expiração.
 * Retorna null para token inválido/expirado (→ 401). Erros de configuração
 * do segredo propagam (falha de servidor, não de credencial).
 */
export async function verifyAccessToken(token: string): Promise<VerifiedAccessToken | null> {
  const key = getJwtSecretKey();

  try {
    const { payload } = await jwtVerify(token, key, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      clockTolerance: JWT_CLOCK_TOLERANCE_SECONDS,
      algorithms: [JWT_ALGORITHM],
    });

    if (typeof payload.sub !== "string" || payload.sub.length === 0) return null;
    if (typeof payload.sid !== "string" || payload.sid.length === 0) return null;
    if (typeof payload.jti !== "string" || payload.jti.length === 0) return null;

    return { subject: payload.sub, sessionId: payload.sid, tokenId: payload.jti };
  } catch {
    return null;
  }
}
