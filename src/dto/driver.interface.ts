import type { DriverStatus } from "./shared.types.ts";

export interface UpdateDriverLocationDTO {
  latitude: number;
  longitude: number;
}

export interface AcceptOfferDTO {
  rideId: string;
  offerId: string;
}

export interface RejectOfferDTO {
  rideId: string;
  offerId: string;
}

export interface CompleteRideDTO {
  rideId: string;
  latitude: number;
  longitude: number;
}

export interface ActiveRideResponse {
  ride: RideDetailedInfo | null;
}

export interface RideDetailedInfo {
  id: string;
  clientId: string;
  driverId: string;
  origin: {
    name: string;
    lat: number;
    lng: number;
    h3: string;
  };
  destination: {
    name: string;
    lat: number;
    lng: number;
    h3: string;
  };
  regionId: string;
  municipalityId: string;
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  price: number | null;
  distance: number | null;
  duration: number | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  createdAt: Date;
  deletedAt: Date | null;
}

export interface DriverStatusResponse {
  online: boolean;
}

export type { CancelRideParams } from "./shared.types.ts";

export interface DriverRideListResponse {
  rides: RideDetailedInfo[];
}

export interface DriverProfileResponse {
  id: string;
  fullName: string;
  email: string;
  status: DriverStatus;
  rejectionReason: string | null;
  banReason: string | null;
}
