import { api } from "encore.dev/api";
import * as auth from "~encore/auth";
import { userService } from "@/services/user.service";

export const logout = api<void, { message: string }>(
  { expose: true, method: "POST", path: "/auth/logout", auth: true },
  async () => {
    const { sessionID } = auth.getAuthData()!;
    await userService.logout(sessionID);
    return { message: "Logout realizado com sucesso." };
  },
);

export const logoutAll = api<void, { message: string }>(
  { expose: true, method: "POST", path: "/auth/logout-all", auth: true },
  async () => {
    const { userID } = auth.getAuthData()!;
    await userService.logoutAll(userID);
    return { message: "Todas as sessões foram encerradas." };
  },
);

export const listSessions = api<void, { sessions: Array<{ id: string; deviceId: string | null; userAgent: string | null; ipAddress: string | null; createdAt: Date; lastSeenAt: Date; isCurrent: boolean }> }>(
  { expose: true, method: "GET", path: "/auth/sessions", auth: true },
  async () => {
    const { userID, sessionID } = auth.getAuthData()!;
    const sessions = await userService.getUserSessions(userID);
    const result = sessions.map(s => ({ ...s, isCurrent: s.id === sessionID }));
    return { sessions: result };
  },
);

export const revokeSession = api<{ sessionId: string }, { message: string }>(
  { expose: true, method: "DELETE", path: "/auth/sessions/:sessionId", auth: true },
  async (params) => {
    const { userID } = auth.getAuthData()!;
    await userService.revokeSession(userID, params.sessionId);
    return { message: "Sessão encerrada com sucesso." };
  },
);
