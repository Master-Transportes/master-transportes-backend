import { verifyToken } from "@/auth/auth";
import { APIError } from "encore.dev/api";
import { authHandler } from "encore.dev/auth";
import { Header } from "encore.dev/api";
import { sessionStore } from "@/cache";

export interface AuthParams {
  authorization: Header<"Authorization">;
}

export interface AuthData {
  userID: string;
  sessionID: string;
  role: string;
}

export const auth = authHandler<AuthParams, AuthData>(async params => {
  const authHeader = params.authorization;
  if (!authHeader) throw APIError.invalidArgument("Missing 'Authorization' header.");
  if (!authHeader.startsWith("Bearer "))
    throw APIError.invalidArgument("Invalid 'Authorization' header format. Expected 'Bearer <token>'.");

  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) throw APIError.invalidArgument("Token must not be empty.");

  const payload = verifyToken(token);

  const session = await sessionStore.get(payload.sid);
  if (!session) {
    throw APIError.unauthenticated("Sessão não encontrada ou expirada.");
  }

  if (session.revokedAt) {
    throw APIError.unauthenticated("Sessão revogada.");
  }

  sessionStore.updateLastSeenAt(session.id);

  return {
    userID: payload.sub,
    sessionID: payload.sid,
    role: payload.role,
  };
});
