import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import type { JWTObject } from "@/dto/auth.interface";

const JWT_SECRET = process.env.JWT_SECRET!;
if (!JWT_SECRET) throw new Error("variable JWT_SECRET is missing.");

const THIRTY_MINUTES_IN_S = 1800;
export const JWT_EXPIRES_IN = THIRTY_MINUTES_IN_S;

export function generateToken(userJWT: JWTObject): string {
  return jwt.sign({ ...userJWT, jwtid: randomUUID() }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

export function verifyToken(token: string): JWTObject {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JWTObject;
    return payload;
  } catch (error) {
    throw new Error("Invalid or expired token.");
  }
}
