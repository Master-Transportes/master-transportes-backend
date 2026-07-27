import type { RideDetailedRow } from "@/contracts/IRideRepository";

export interface UpdateDriverLocationDTO {
  latitude: number;
  longitude: number;
}

export interface AcceptOfferDTO {
  rideId: string;
  offerId: string;
}

export interface ActiveRideResponse {
  ride: RideDetailedRow | null;
}
