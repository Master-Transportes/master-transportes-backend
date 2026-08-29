import type { RideStatus } from "@/infra/database/schema";

export interface RideDbRow {
  id: string;
  clientId: string;
  driverId: string;
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

export interface RideWithDriverDbRow extends RideDbRow {
  driverFullName: string;
  vehicleBrand: string | null;
  vehicleModel: string | null;
  vehicleYear: number | null;
  vehicleColor: string | null;
  vehiclePlate: string | null;
}
