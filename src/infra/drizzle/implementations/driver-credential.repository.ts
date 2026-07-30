import { eq } from "drizzle-orm";
import { driverCredentials } from "../schema";
import { db } from "../drizzle";
import type { IDriverCredentialRepository, DriverCredentialRow, CreateDriverCredentialData } from "../contracts/IDriverCredentialRepository";

export class DriverCredentialRepository implements IDriverCredentialRepository {
  async findByEmail(email: string): Promise<DriverCredentialRow | null> {
    const [row] = await db
      .select()
      .from(driverCredentials)
      .where(eq(driverCredentials.email, email.toLowerCase()))
      .limit(1);
    return row ?? null;
  }

  async findByDriverId(driverId: string): Promise<DriverCredentialRow | null> {
    const [row] = await db
      .select()
      .from(driverCredentials)
      .where(eq(driverCredentials.driverId, driverId))
      .limit(1);
    return row ?? null;
  }

  async create(data: CreateDriverCredentialData): Promise<void> {
    await db.insert(driverCredentials).values(data);
  }

  async updatePassword(driverId: string, password: string): Promise<void> {
    await db
      .update(driverCredentials)
      .set({ password, updatedAt: new Date() })
      .where(eq(driverCredentials.driverId, driverId));
  }
}

export const driverCredentialRepository = new DriverCredentialRepository();
