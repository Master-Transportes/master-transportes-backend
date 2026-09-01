import { verifyToken } from "@/auth/auth";
import { APIError, Gateway } from "encore.dev/api";
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
  if (!authHeader) throw APIError.invalidArgument("Cabeçalho 'Authorization' ausente.");
  if (!authHeader.startsWith("Bearer "))
    throw APIError.invalidArgument("Formato do cabeçalho 'Authorization' inválido. Esperado 'Bearer <token>'.");

  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) throw APIError.invalidArgument("Token não pode ser vazio.");

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

export const gateway = new Gateway({
  authHandler: auth,
});
