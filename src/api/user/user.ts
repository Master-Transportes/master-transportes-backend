import { api } from "encore.dev/api";
import * as auth from "~encore/auth";
import { userService } from "@/services/user.service";
import { getRequestMetadata } from "@/middlewares/rate-limit.middleware";
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
  ActiveRideResponse,
  PendingRideRequestResponse,
} from "@/dto/user.interface";
import type { SignInDTO, SignInResponse, RefreshDTO, RefreshResponse, GetMeResponse } from "@/dto/access.interface";

export const login = api<SignInDTO, SignInResponse>(
  { expose: true, method: "POST", path: "/auth/login", auth: false },
  async payload => {
    const meta = getRequestMetadata();
    return userService.signIn(payload, meta);
  },
);

export const register = api<RegisterUserDTO, RegisterAccountResponse>(
  { expose: true, method: "POST", path: "/client/register", auth: false },
  async payload => userService.register(payload),
);

export const refresh = api<RefreshDTO, RefreshResponse>(
  { expose: true, method: "POST", path: "/client/refresh", auth: false },
  async ({ refreshToken }) => userService.refreshSession(refreshToken),
);

export const me = api<void, GetMeResponse>(
  { expose: true, method: "GET", path: "/client/me", auth: true },
  async () => {
    const { userID } = auth.getAuthData()!;
    return userService.getMe(userID);
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

export const listRides = api<void, RideListResponse>(
  { expose: true, method: "GET", path: "/client/rides", auth: true },
  async () => {
    const { userID } = auth.getAuthData()!;
    return userService.getRides(userID);
  },
);

export const requestRide = api<RequestRideDTO, RequestRideResponse>(
  { expose: true, method: "POST", path: "/client/rides", auth: true },
  async payload => {
    const { userID } = auth.getAuthData()!;
    return userService.requestRide(userID, payload);
  },
);

export const getActiveRide = api<void, ActiveRideResponse>(
  { expose: true, method: "GET", path: "/client/rides/active", auth: true },
  async () => {
    const { userID } = auth.getAuthData()!;
    return userService.getActiveRide(userID);
  },
);

export const getPendingRideRequest = api<void, PendingRideRequestResponse>(
  { expose: true, method: "GET", path: "/client/rides/pending", auth: true },
  async () => {
    const { userID } = auth.getAuthData()!;
    return userService.getPendingRideRequest(userID);
  },
);

export const cancelRide = api<CancelRideParams, void>(
  { expose: true, method: "DELETE", path: "/client/rides/:rideId", auth: true },
  async payload => {
    const { userID } = auth.getAuthData()!;
    await userService.cancelRide(userID, payload);
  },
);

export const cancelRideRequest = api<{ rideId: string }, void>(
  { expose: true, method: "DELETE", path: "/client/rides/:rideId/request", auth: true },
  async payload => {
    const { userID } = auth.getAuthData()!;
    await userService.cancelRideRequest(userID, payload.rideId);
  },
);
