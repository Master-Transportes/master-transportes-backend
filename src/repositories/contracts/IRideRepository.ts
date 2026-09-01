import type { RideStatus } from "@/infra/database/schema";

export interface OriginLocation {
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
  clientId: string;
  driverId: string;
  origin: OriginLocation;
  destination: DestinationLocation;
  regionId: string;
  municipalityId: string;
  status: RideStatus;
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

export interface RideActiveRow {
  id: string;
  clientId: string;
  driverId: string;
  status: RideStatus;
  price: number | null;
  distance: number | null;
  duration: number | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  deletedAt: Date | null;
}

export interface RideWithDriverVehicle {
  brand: string;
  model: string;
  year: number;
  color: string;
  plate: string;
}

export interface RideWithDriverRow extends RideDetailedRow {
  driver: {
    name: string;
    photo: string | null;
    vehicle: RideWithDriverVehicle | null;
  };
}

export interface PaginatedRidesResult {
  rides: RideDetailedRow[];
  total: number;
}

export interface IRideRepository {
  findById(rideId: string): Promise<RideDetailedRow | null>;
  findByClientId(clientId: string, page: number, limit: number): Promise<PaginatedRidesResult>;
  findByDriverId(driverId: string, page: number, limit: number): Promise<PaginatedRidesResult>;
  findActiveByClientId(clientId: string, statuses: RideStatus[]): Promise<boolean>;
  findActiveByClientDetailed(clientId: string, statuses: RideStatus[]): Promise<RideWithDriverRow | null>;
  findActiveByDriverId(driverId: string, statuses: RideStatus[]): Promise<RideDetailedRow | null>;
  findActiveByIdAndClient(rideId: string, clientId: string, statuses: RideStatus[]): Promise<RideActiveRow | null>;
  findActiveByIdAndDriver(rideId: string, driverId: string, statuses: RideStatus[]): Promise<RideDetailedRow | null>;
  createRideAndLocation(data: CreateRideData): Promise<void>;
  updateToCompleted(rideId: string): Promise<RideDetailedRow | null>;
  updateToCancelled(rideId: string, cancelledBy: string, cancelReason?: string | null): Promise<void>;
}
