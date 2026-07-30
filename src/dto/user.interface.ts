import type { Role, UserStatus } from "@/infra/db/schema";

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

export interface PickupInfo {
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
  pickup: PickupInfo;
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
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  originName: string;
  destinationName: string;
}

export interface RequestRideResponse {
  rideId: string;
}

export interface CancelRideParams {
  rideId: string;
}
