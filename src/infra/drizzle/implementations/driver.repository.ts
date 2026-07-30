import { eq } from "drizzle-orm";
import { drivers, driverCredentials } from "../schema";
import { db } from "../drizzle";
import type { IDriverRepository, DriverRow, CreateDriverData, DriverWithProfile } from "../contracts/IDriverRepository";

export class DriverRepository implements IDriverRepository {
  async create(data: CreateDriverData): Promise<DriverRow> {
    const [driver] = await db.insert(drivers).values(data).returning();
    return driver;
  }

  async findById(id: string): Promise<DriverWithProfile | null> {
    const [row] = await db
      .select({
        id: drivers.id,
        fullName: drivers.fullName,
        email: driverCredentials.email,
        status: drivers.status,
      })
      .from(drivers)
      .innerJoin(driverCredentials, eq(driverCredentials.driverId, drivers.id))
      .where(eq(drivers.id, id))
      .limit(1);
    return row ?? null;
  }

  async findByIdWithStatus(id: string): Promise<{ role: string; status: string } | null> {
    const [row] = await db
      .select({ status: drivers.status })
      .from(drivers)
      .where(eq(drivers.id, id))
      .limit(1);
    return row ? { role: "DRIVER", status: row.status } : null;
  }

  async updateProfile(id: string, data: { fullName?: string }): Promise<DriverWithProfile | null> {
    const [row] = await db
      .update(drivers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(drivers.id, id))
      .returning({ id: drivers.id, fullName: drivers.fullName, status: drivers.status });
    if (!row) return null;
    const profile = await this.findById(id);
    return profile;
  }

  async updatePassword(id: string, password: string): Promise<void> {
    await db
      .update(driverCredentials)
      .set({ password, updatedAt: new Date() })
      .where(eq(driverCredentials.driverId, id));
  }
}

export const driverRepository = new DriverRepository();
