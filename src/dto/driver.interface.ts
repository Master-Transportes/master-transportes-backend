import type { RideDetailedRow } from "@/infra/drizzle/contracts/IRideRepository";
import type { DriverStatus } from "@/infra/drizzle/schema";

export interface UpdateDriverLocationDTO {
  latitude: number;
  longitude: number;
}

export interface AcceptOfferDTO {
  rideId: string;
  offerId: string;
}

export interface CompleteRideDTO {
  rideId: string;
  latitude: number;
  longitude: number;
}

export interface ActiveRideResponse {
  ride: RideDetailedRow | null;
}

export interface CancelRideParams {
  rideId: string;
}

export interface DriverProfileResponse {
  id: string;
  fullName: string;
  email: string;
  status: DriverStatus;
}
