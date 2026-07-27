import { api } from "encore.dev/api";
import * as auth from "~encore/auth";
import { accessService } from "@/services/access.service";
import type { GetMeResponse, SignInDTO, SignInResponse } from "@/dto/access.interface";

export const signIn = api<SignInDTO, SignInResponse>(
  { expose: true, method: "POST", path: "/access/login", auth: false },
  async payload => accessService.signIn(payload),
);

export const me = api<void, GetMeResponse>(
  { expose: true, method: "GET", path: "/access/me", auth: true },
  async () => {
    const { userID } = auth.getAuthData()!;
    return accessService.getMe(userID);
  },
);
