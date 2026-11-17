import { api } from "encore.dev/api";
import * as auth from "~encore/auth";
import { AuthRole } from "@/domain/identity/identity.types";
import { authService } from "@/services/auth.service";
import { clientService } from "@/services/client.service";
import { validateOrThrow } from "@/validations/schema-validator";
import { LoginSchema, RefreshSchema } from "@/validations/auth.validate";
import { ClientRegisterSchema } from "@/validations/client.validate";
import type { ClientMeResponse, ClientRegisterRequest, ClientRegisterResponse } from "@/dto/client.dto";
import type { LoginRequest, LoginResponse, LogoutResponse, RefreshRequest, RefreshResponse } from "@/dto/auth.dto";

export const register = api<ClientRegisterRequest, ClientRegisterResponse>(
  { expose: true, method: "POST", path: "/client/register", auth: false, sensitive: true },
  async payload => {
    const input = validateOrThrow(ClientRegisterSchema, payload);
    return clientService.register(input);
  },
);

export const login = api<LoginRequest, LoginResponse>(
  { expose: true, method: "POST", path: "/client/login", auth: false, sensitive: true },
  async payload => {
    const input = validateOrThrow(LoginSchema, payload);
    return authService.login(input, AuthRole.Client);
  },
);

export const refresh = api<RefreshRequest, RefreshResponse>(
  { expose: true, method: "POST", path: "/client/refresh", auth: false, sensitive: true },
  async payload => {
    const input = validateOrThrow(RefreshSchema, payload);
    return authService.refresh(input, AuthRole.Client);
  },
);

export const logout = api<void, LogoutResponse>(
  { expose: true, method: "POST", path: "/client/logout", auth: true, sensitive: true },
  async () => {
    const authData = auth.getAuthData()!;
    await authService.logout(authData);
    return { message: "Logout realizado com sucesso." };
  },
);

export const me = api<void, ClientMeResponse>(
  { expose: true, method: "GET", path: "/client/me", auth: true, sensitive: true, tags: ["client-role"] },
  async () => {
    const { userID } = auth.getAuthData()!;
    return clientService.getMe(userID);
  },
);
