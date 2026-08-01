import type { Role, UserStatus } from "./shared.types.ts";
import type { RideWithDriverRow } from "@/infra/drizzle/contracts/IRideRepository";

export interface RegisterUserDTO {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface RegisterDriverDTO {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface UpdateProfileDTO {
  fullName?: string;
  email?: string;
}

export interface ChangePasswordDTO {
  currentPassword: string;
  newPassword: string;
}

export interface UserProfileResponse {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  status: UserStatus;
}

export interface OriginInfo {
  name: string;
  lat: number;
  lng: number;
}

export interface DestinationInfo {
  name: string;
  lat: number;
  lng: number;
}

export interface RideSummary {
  id: string;
  origin: OriginInfo;
  destination: DestinationInfo;
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
}

export interface RegisterAccountResponse {
  id: string;
}

export interface RideListResponse {
  rides: RideSummary[];
}

export interface RequestRideDTO {
  origin: OriginInfo;
  destination: DestinationInfo;
}

export interface RequestRideResponse {
  rideId: string;
}

export interface CancelRideParams {
  rideId: string;
}

export interface ActiveRideResponse {
  ride: RideWithDriverRow | null;
}

export interface PendingRideRequestResponse {
  rideId: string | null;
}
