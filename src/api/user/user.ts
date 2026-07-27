import { api } from "encore.dev/api";
import * as auth from "~encore/auth";
import { userService } from "@/services/user.service";
import {
  ChangePasswordDTO,
  RegisterAccountResponse,
  RegisterUserDTO,
  RideListResponse,
  UpdateProfileDTO,
  UserProfileResponse,
} from "@/dto/user.interface";
import { publishToUser } from "@/infra/rabbitmq/publisher";

export const register = api<RegisterUserDTO, RegisterAccountResponse>(
  { expose: true, method: "POST", path: "/client/register", auth: false },
  async payload => userService.register(payload),
);

export const rides = api<void, RideListResponse>(
  { expose: true, method: "GET", path: "/client/rides", auth: true },
  async () => {
    const { userID } = auth.getAuthData()!;
    return userService.getRides(userID);
  },
);

export const updateProfile = api<UpdateProfileDTO, UserProfileResponse>(
  { expose: true, method: "PUT", path: "/client/profile", auth: true },
  async payload => {
    const { userID } = auth.getAuthData()!;
    return userService.updateProfile(userID, payload);
  },
);

export const updatePassword = api<ChangePasswordDTO, void>(
  { expose: true, method: "PUT", path: "/client/password", auth: true },
  async payload => {
    const { userID } = auth.getAuthData()!;
    await userService.changePassword(userID, payload);
  },
);
