import type { DriverStatus } from "@/interfaces/user-types";

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
}
