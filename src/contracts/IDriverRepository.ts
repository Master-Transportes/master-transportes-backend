import type { DriverStatus, RideStatus } from "@/infra/db/schema";

export interface CreateDriverData {
  userId: string;
}

export interface DriverRow {
  id: string;
  userId: string;
  cnh: string | null;
  cnhCategory: string | null;
  status: DriverStatus;
  rejectionReason: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IDriverRepository {
  create(data: CreateDriverData): Promise<DriverRow>;
  findActiveRideByDriver(driverId: string): Promise<{
    rideId: string;
    passengerId: string;
    status: RideStatus;
    pickupLat: number;
    pickupLng: number;
  } | null>;
}
