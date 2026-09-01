import { api } from "encore.dev/api";
import * as auth from "~encore/auth";
import { userService } from "@/services/user.service";
import type { LogoutResponse, RevokeSessionParams, ListSessionsResponse } from "@/dto/access.interface";

export const logout = api<void, LogoutResponse>(
  { expose: true, method: "POST", path: "/auth/logout", auth: true },
  async () => {
    const { sessionID } = auth.getAuthData()!;
    await userService.logout(sessionID);
    return { message: "Logout realizado com sucesso." };
  },
);

export const logoutAll = api<void, LogoutResponse>(
  { expose: true, method: "POST", path: "/auth/logout-all", auth: true },
  async () => {
    const { userID } = auth.getAuthData()!;
    await userService.logoutAll(userID);
    return { message: "Todas as sessões foram encerradas." };
  },
);

export const listSessions = api<void, ListSessionsResponse>(
  { expose: true, method: "GET", path: "/auth/sessions", auth: true },
  async () => {
    const { userID, sessionID } = auth.getAuthData()!;
    const sessions = await userService.getUserSessions(userID);
    const result = sessions.map(s => ({ ...s, isCurrent: s.id === sessionID }));
    return { sessions: result };
  },
);

export const revokeSession = api<RevokeSessionParams, LogoutResponse>(
  { expose: true, method: "DELETE", path: "/auth/sessions/:sessionId", auth: true },
  async params => {
    const { userID } = auth.getAuthData()!;
    await userService.revokeSession(userID, params.sessionId);
    return { message: "Sessão encerrada com sucesso." };
  },
);
