import { api } from "encore.dev/api";
import * as auth from "~encore/auth";
import { AuthRole } from "@/domain/identity/identity.types";
import { authService } from "@/services/auth.service";
import { driverService } from "@/services/driver.service";
import { requireRole } from "@/auth/authorization";
import type {
  DriverMeResponse,
  DriverRegisterRequest,
  DriverRegisterResponse,
} from "@/dto/driver.dto";
import type {
  LoginRequest,
  LoginResponse,
  LogoutResponse,
  RefreshRequest,
  RefreshResponse,
} from "@/dto/auth.dto";

export const register = api<DriverRegisterRequest, DriverRegisterResponse>(
  { expose: true, method: "POST", path: "/driver/register", auth: false },
  async payload => driverService.register(payload),
);

export const login = api<LoginRequest, LoginResponse>(
  { expose: true, method: "POST", path: "/driver/login", auth: false },
  async payload => authService.login(payload, AuthRole.Driver),
);

export const refresh = api<RefreshRequest, RefreshResponse>(
  { expose: true, method: "POST", path: "/driver/refresh", auth: false },
  async payload => authService.refresh(payload, AuthRole.Driver),
);

export const logout = api<void, LogoutResponse>(
  { expose: true, method: "POST", path: "/driver/logout", auth: true },
  async () => {
    const authData = auth.getAuthData()!;
    await authService.logout(authData);
    return { message: "Logout realizado com sucesso." };
  },
);

export const me = api<void, DriverMeResponse>(
  { expose: true, method: "GET", path: "/driver/me", auth: true },
  async () => {
    const authData = auth.getAuthData()!;
    requireRole(authData, AuthRole.Driver);
    return driverService.getMe(authData.userID);
  },
);
