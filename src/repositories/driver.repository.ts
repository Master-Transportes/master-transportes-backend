import { eq } from "drizzle-orm";
import { drivers } from "@/infra/db/schema";
import type { DriverStatus } from "@/infra/db/schema";
import { DrizzleDatabase, drizzleDatabase } from "@/infra/adapters/drizzle-db.adapter";

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

export class DriverRepository implements IDriverRepository {
  constructor(private readonly database: DrizzleDatabase) {}

  async create(data: CreateDriverData): Promise<DriverRow> {
    const [driver] = await this.database.db
      .insert(drivers)
      .values(data)
      .returning();
    return driver;
  }
}

export const driverRepository = new DriverRepository(drizzleDatabase);
