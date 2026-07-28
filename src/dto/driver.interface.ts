import type { RideDetailedRow } from "@/contracts/IRideRepository";

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
