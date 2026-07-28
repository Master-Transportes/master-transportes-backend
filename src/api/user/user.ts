import { api } from "encore.dev/api";
import * as auth from "~encore/auth";
import { userService } from "@/services/user.service";
import type {
  CancelRideParams,
  ChangePasswordDTO,
  RegisterAccountResponse,
  RegisterUserDTO,
  RequestRideDTO,
  RequestRideResponse,
  RideListResponse,
  UpdateProfileDTO,
  UserProfileResponse,
} from "@/dto/user.interface";
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

export const requestRide = api<RequestRideDTO, RequestRideResponse>(
  { expose: true, method: "POST", path: "/ride/request", auth: true },
  async payload => {
    const { userID } = auth.getAuthData()!;
    return userService.requestRide(userID, payload);
  },
);

export const cancelRide = api<CancelRideParams, void>(
  { expose: true, method: "DELETE", path: "/ride/:rideId/cancel", auth: true },
  async payload => {
    const { userID } = auth.getAuthData()!;
    await userService.cancelRide(userID, payload);
  },
);

// Consumer is started explicitly by the Encore app lifecycle, not at module load
