import jwt from "jsonwebtoken";
import { randomUUID, createHash, randomBytes } from "crypto";
import type { AccessTokenPayload } from "@/dto/auth.interface";
import { ACCESS_TOKEN_TTL_SECONDS } from "@/constants/cache";

const JWT_SECRET = process.env.JWT_SECRET!;
if (!JWT_SECRET) throw new Error("variable JWT_SECRET is missing.");

export const JWT_EXPIRES_IN = ACCESS_TOKEN_TTL_SECONDS;

const ISSUER = "master-transporte";

export function generateToken(payload: { sub: string; sid: string; role: "CLIENT" | "DRIVER" }): string {
  return jwt.sign({ sid: payload.sid, role: payload.role }, JWT_SECRET, {
    subject: payload.sub,
    jwtid: randomUUID(),
    issuer: ISSUER,
    audience: payload.role === "DRIVER" ? "driver-app" : "client-app",
    expiresIn: JWT_EXPIRES_IN,
  });
}

export function verifyToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, JWT_SECRET, {
    issuer: ISSUER,
    audience: ["client-app", "driver-app"],
  }) as jwt.JwtPayload;

  return {
    sub: decoded.sub!,
    sid: decoded.sid as string,
    jti: decoded.jti!,
    role: decoded.role as "CLIENT" | "DRIVER",
    iss: decoded.iss!,
    aud: Array.isArray(decoded.aud) ? decoded.aud[0] : decoded.aud!,
    iat: decoded.iat!,
    exp: decoded.exp!,
  };
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
