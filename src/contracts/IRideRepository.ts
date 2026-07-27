import type { RideStatus } from "@/infra/db/schema";

export interface PickupLocation {
  name: string;
  lat: number;
  lng: number;
  h3: string;
}

export interface DestinationLocation {
  name: string;
  lat: number;
  lng: number;
  h3: string;
}

export interface RideDetailedRow {
  id: string;
  pickup: PickupLocation;
  destination: DestinationLocation;
  regionId: string;
  municipalityId: string;
  status: RideStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
}

export interface CreateRideData {
  id: string;
  clientId: string;
  driverId: string;
  status: RideStatus;
  originName: string;
  originLat: number;
  originLng: number;
  originH3: string;
  destinationName: string;
  destinationLat: number;
  destinationLng: number;
  destinationH3: string;
  regionId: string;
  municipalityId: string;
}

export interface IRideRepository {
  findByClientId(clientId: string): Promise<RideDetailedRow[]>;
  findByDriverId(driverId: string): Promise<RideDetailedRow[]>;
  findActiveByClientId(clientId: string): Promise<boolean>;
  findActiveByDriverId(driverId: string): Promise<RideDetailedRow | null>;
  createRideAndLocation(data: CreateRideData): Promise<void>;
}
