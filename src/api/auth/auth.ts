import { api } from "encore.dev/api";
import * as auth from "~encore/auth";
import { userService } from "@/services/user.service";
import type { RefreshDTO, RefreshResponse } from "@/dto/access.interface";

export const refresh = api<RefreshDTO, RefreshResponse>(
  { expose: true, method: "POST", path: "/auth/refresh", auth: false },
  async ({ refreshToken, sessionId }) => userService.refreshSession(sessionId, refreshToken),
);

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

export const listSessions = api<void, { sessions: string[] }>(
  { expose: true, method: "GET", path: "/auth/sessions", auth: true },
  async () => {
    const { userID } = auth.getAuthData()!;
    const sessions = await userService.getUserSessions(userID);
    return { sessions };
  },
);
