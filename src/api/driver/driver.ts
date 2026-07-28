import { api } from "encore.dev/api";
import * as auth from "~encore/auth";
import { driverService } from "@/services/driver.service";
import type {
  ChangePasswordDTO,
  RegisterAccountResponse,
  RegisterDriverDTO,
  RideListResponse,
  UpdateProfileDTO,
} from "@/dto/user.interface";
import type {
  UpdateDriverLocationDTO,
  AcceptOfferDTO,
  CancelRideParams,
  CompleteRideDTO,
  ActiveRideResponse,
  DriverProfileResponse,
} from "@/dto/driver.interface";
import type { SignInDTO, SignInResponse, RefreshDTO, RefreshResponse } from "@/dto/access.interface";

export const login = api<SignInDTO, SignInResponse>(
  { expose: true, method: "POST", path: "/driver/login", auth: false },
  async payload => driverService.signIn(payload),
);

export const me = api<void, DriverProfileResponse>(
  { expose: true, method: "GET", path: "/driver/me", auth: true },
  async () => {
    const { userID } = auth.getAuthData()!;
    return driverService.getMe(userID);
  },
);

export const logout = api<void, { message: string }>(
  { expose: true, method: "POST", path: "/driver/logout", auth: true },
  async () => {
    const { sessionID } = auth.getAuthData()!;
    await driverService.logout(sessionID);
    return { message: "Logout realizado com sucesso." };
  },
);

export const refresh = api<RefreshDTO, RefreshResponse>(
  { expose: true, method: "POST", path: "/driver/refresh", auth: false },
  async ({ refreshToken, sessionId }) => driverService.refreshSession(sessionId, refreshToken),
);

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

export const updateProfile = api<UpdateProfileDTO, DriverProfileResponse>(
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

export const acceptOffer = api<AcceptOfferDTO, void>(
  { expose: true, method: "POST", path: "/driver/offer/accept", auth: true },
  async payload => {
    const { userID } = auth.getAuthData()!;
    await driverService.acceptOffer(userID, payload);
  },
);

export const goOnline = api<void, void>(
  { expose: true, method: "POST", path: "/driver/go-online", auth: true },
  async () => {
    const { userID } = auth.getAuthData()!;
    await driverService.goOnline(userID);
  },
);

export const goOffline = api<void, void>(
  { expose: true, method: "POST", path: "/driver/go-offline", auth: true },
  async () => {
    const { userID } = auth.getAuthData()!;
    await driverService.goOffline(userID);
  },
);

export const getActiveRide = api<void, ActiveRideResponse>(
  { expose: true, method: "GET", path: "/driver/ride/active", auth: true },
  async () => {
    const { userID } = auth.getAuthData()!;
    return driverService.getActiveRide(userID);
  },
);

export const cancelRide = api<CancelRideParams, void>(
  { expose: true, method: "DELETE", path: "/driver/:rideId/cancel", auth: true },
  async payload => {
    const { userID } = auth.getAuthData()!;
    await driverService.cancelRide(userID, payload);
  },
);

export const completeRide = api<CompleteRideDTO, ActiveRideResponse>(
  { expose: true, method: "PUT", path: "/driver/:rideId/complete", auth: true },
  async payload => {
    const { userID } = auth.getAuthData()!;
    return driverService.completeRide(userID, payload);
  },
);
