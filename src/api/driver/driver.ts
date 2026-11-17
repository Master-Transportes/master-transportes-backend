import { api } from "encore.dev/api";
import * as auth from "~encore/auth";
import { requireAuthData } from "@/auth/authorization";
import { AuthRole } from "@/domain/identity/identity.types";
import { authService } from "@/services/auth.service";
import { driverService } from "@/services/driver.service";
import type { DriverMeResponse, DriverRegisterRequest, DriverRegisterResponse } from "@/dto/driver.dto";
import type { LoginRequest, LoginResponse, LogoutResponse, RefreshRequest, RefreshResponse } from "@/dto/auth.dto";

export const register = api<DriverRegisterRequest, DriverRegisterResponse>(
  { expose: true, method: "POST", path: "/driver/register", auth: false, sensitive: true },
  async payload => {
    return driverService.register(payload);
  },
);

export const login = api<LoginRequest, LoginResponse>(
  { expose: true, method: "POST", path: "/driver/login", auth: false, sensitive: true },
  async payload => {
    return authService.login(payload, AuthRole.Driver);
  },
);

export const refresh = api<RefreshRequest, RefreshResponse>(
  { expose: true, method: "POST", path: "/driver/refresh", auth: false, sensitive: true },
  async payload => {
    return authService.refresh(payload, AuthRole.Driver);
  },
);

// Sem tag de papel: logout deve funcionar com sessão válida mesmo se o papel
// DRIVER tiver sido removido depois do login.
export const logout = api<void, LogoutResponse>(
  { expose: true, method: "POST", path: "/driver/logout", auth: true, sensitive: true },
  async () => {
    const authData = requireAuthData(auth.getAuthData());
    await authService.logout(authData);
    return { message: "Logout realizado com sucesso." };
  },
);

export const me = api<void, DriverMeResponse>(
  { expose: true, method: "GET", path: "/driver/me", auth: true, sensitive: true, tags: ["driver-role"] },
  async () => {
    const { userID } = requireAuthData(auth.getAuthData());
    return driverService.getMe(userID);
  },
);
