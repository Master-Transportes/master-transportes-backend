import { api } from "encore.dev/api";
import * as auth from "~encore/auth";
import { driverService } from "@/services/driver.service";
import type {
  ChangePasswordDTO,
  RegisterAccountResponse,
  RegisterDriverDTO,
  RideListResponse,
  UpdateProfileDTO,
  UserProfileResponse,
} from "@/dto/user.interface";
import type { UpdateDriverLocationDTO, AcceptOfferDTO, CancelRideParams, CompleteRideDTO, ActiveRideResponse } from "@/dto/driver.interface";

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
