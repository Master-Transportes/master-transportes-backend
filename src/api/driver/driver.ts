import { api } from "encore.dev/api";
import * as auth from "~encore/auth";
import { driverService } from "@/services/driver.service";
import {
  ChangePasswordDTO,
  RegisterAccountResponse,
  RegisterDriverDTO,
  RideListResponse,
  UpdateProfileDTO,
  UserProfileResponse,
} from "@/dto/user.interface";
import { UpdateDriverLocationDTO } from "@/dto/driver.interface";

export const register = api<RegisterDriverDTO, RegisterAccountResponse>(
  { expose: true, method: "POST", path: "/driver/register", auth: false },
  async payload => driverService.register(payload),
);

export const rides = api<void, RideListResponse>(
  { expose: true, method: "GET", path: "/driver/rides", auth: true },
  async () => {
    const { userID } = auth.getAuthData()!;
    return driverService.getRides(userID);
  },
);

export const updateProfile = api<UpdateProfileDTO, UserProfileResponse>(
  { expose: true, method: "PUT", path: "/driver/profile", auth: true },
  async payload => {
    const { userID } = auth.getAuthData()!;
    return driverService.updateProfile(userID, payload);
  },
);

export const updatePassword = api<ChangePasswordDTO, void>(
  { expose: true, method: "PUT", path: "/driver/password", auth: true },
  async payload => {
    const { userID } = auth.getAuthData()!;
    await driverService.changePassword(userID, payload);
  },
);

export const updateLocation = api<UpdateDriverLocationDTO, void>(
  { expose: true, method: "PUT", path: "/driver/location", auth: true },
  async payload => {
    const { userID } = auth.getAuthData()!;
    await driverService.updateLocation(userID, payload);
  },
);
