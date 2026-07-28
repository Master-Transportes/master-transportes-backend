import { api } from "encore.dev/api";
import * as auth from "~encore/auth";
import { driverAccessService } from "@/services/driver-access.service";
import type { SignInDTO, SignInResponse, RefreshDTO, RefreshResponse } from "@/dto/access.interface";
import type { DriverProfileResponse } from "@/dto/driver.interface";

export const login = api<SignInDTO, SignInResponse>(
  { expose: true, method: "POST", path: "/driver/login", auth: false },
  async payload => driverAccessService.signIn(payload),
);

export const me = api<void, DriverProfileResponse>(
  { expose: true, method: "GET", path: "/driver/me", auth: true },
  async () => {
    const { userID } = auth.getAuthData()!;
    return driverAccessService.getMe(userID);
  },
);

export const logout = api<void, { message: string }>(
  { expose: true, method: "POST", path: "/driver/logout", auth: true },
  async () => {
    const { sessionID } = auth.getAuthData()!;
    await driverAccessService.logout(sessionID);
    return { message: "Logout realizado com sucesso." };
  },
);

export const refresh = api<RefreshDTO, RefreshResponse>(
  { expose: true, method: "POST", path: "/driver/refresh", auth: false },
  async ({ refreshToken, sessionId }) => driverAccessService.refreshSession(sessionId, refreshToken),
);
