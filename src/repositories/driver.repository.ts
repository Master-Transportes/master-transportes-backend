import { drivers } from "@/infra/db/schema";
import { db } from "@/infra/db/drizzle";
import type { IDriverRepository, DriverRow, CreateDriverData } from "@/contracts/IDriverRepository";

export class DriverRepository implements IDriverRepository {
  async create(data: CreateDriverData): Promise<DriverRow> {
    const [driver] = await db.insert(drivers).values(data).returning();
    return driver;
  }
}

export const driverRepository = new DriverRepository();
export type { DriverRow, CreateDriverData };
