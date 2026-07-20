import { api, APIError } from "encore.dev/api";
import * as auth from "~encore/auth";
import { accessService } from "@/services/access.service";
import { sessionService } from "@/services/session.service";
import type { RefreshDTO, RefreshResponse, LogoutResponse } from "@/interfaces/access.interface";

export const refresh = api<RefreshDTO, RefreshResponse>(
  { expose: true, method: "POST", path: "/auth/refresh", auth: false },
  async ({ refreshToken, sessionId }) => accessService.refreshSession(sessionId, refreshToken),
);

export const logout = api<void, LogoutResponse>(
  { expose: true, method: "POST", path: "/auth/logout", auth: true },
  async () => {
    const { sessionID } = auth.getAuthData()!;
    if (!sessionID) throw APIError.invalidArgument("Nenhuma sessão ativa.");
    await accessService.logout(sessionID);
    return { message: "Logout realizado com sucesso." };
  },
);

export const logoutAll = api<void, LogoutResponse>(
  { expose: true, method: "POST", path: "/auth/logout-all", auth: true },
  async () => {
    const { userID } = auth.getAuthData()!;
    await accessService.logoutAll(userID);
    return { message: "Todas as sessões foram encerradas." };
  },
);

export const listSessions = api<void, { sessions: string[] }>(
  { expose: true, method: "GET", path: "/auth/sessions", auth: true },
  async () => {
    const { userID } = auth.getAuthData()!;
    const sessionIds = await sessionService.getUserSessionIds(userID);
    return { sessions: sessionIds };
  },
);
