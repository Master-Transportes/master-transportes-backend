import type { RideStatus } from "@/infra/db/schema";

export interface RideDetailedRow {
  id: string;
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
  status: RideStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
}

export interface IRideRepository {
  findByClientId(clientId: string): Promise<RideDetailedRow[]>;
  findByDriverId(driverId: string): Promise<RideDetailedRow[]>;
}
