import { api, APIError } from "encore.dev/api";
import * as auth from "~encore/auth";
import { accessService } from "@/services/access.service";
import { sessionStore } from "@/infra/session/redis-session-store";
import type { RefreshDTO, RefreshResponse } from "@/dto/access.interface";

export const refresh = api<RefreshDTO, RefreshResponse>(
  { expose: true, method: "POST", path: "/auth/refresh", auth: false },
  async ({ refreshToken, sessionId }) => accessService.refreshSession(sessionId, refreshToken),
);

export const logout = api<void, { message: string }>(
  { expose: true, method: "POST", path: "/auth/logout", auth: true },
  async () => {
    const { sessionID } = auth.getAuthData()!;
    if (!sessionID) throw APIError.invalidArgument("Nenhuma sessão ativa.");
    await accessService.logout(sessionID);
    return { message: "Logout realizado com sucesso." };
  },
);

export const logoutAll = api<void, { message: string }>(
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
    const sessionIds = await sessionStore.getUserSessionIds(userID);
    return { sessions: sessionIds };
  },
);
