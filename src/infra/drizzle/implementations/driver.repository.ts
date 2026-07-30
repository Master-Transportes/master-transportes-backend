import { eq, and, isNull } from "drizzle-orm";
import { drivers } from "../schema";
import { db } from "../drizzle";
import type { IDriverRepository, DriverRow, CreateDriverData, DriverWithProfile } from "../contracts/IDriverRepository";

export class DriverRepository implements IDriverRepository {
  async create(data: CreateDriverData): Promise<DriverRow> {
    const [driver] = await db
      .insert(drivers)
      .values(data)
      .returning({
        id: drivers.id,
        fullName: drivers.fullName,
        email: drivers.email,
        status: drivers.status,
        rejectionReason: drivers.rejectionReason,
        banReason: drivers.banReason,
        approvedAt: drivers.approvedAt,
        createdAt: drivers.createdAt,
        updatedAt: drivers.updatedAt,
        deletedAt: drivers.deletedAt,
      });
    return driver;
  }

  async findById(id: string): Promise<DriverWithProfile | null> {
    const [row] = await db
      .select({
        id: drivers.id,
        fullName: drivers.fullName,
        email: drivers.email,
        status: drivers.status,
        rejectionReason: drivers.rejectionReason,
        banReason: drivers.banReason,
        deletedAt: drivers.deletedAt,
      })
      .from(drivers)
      .where(and(eq(drivers.id, id), isNull(drivers.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  async findByEmail(email: string): Promise<{ id: string; password: string; status: string } | null> {
    const [row] = await db
      .select({ id: drivers.id, password: drivers.password, status: drivers.status })
      .from(drivers)
      .where(eq(drivers.email, email.toLowerCase()))
      .limit(1);
    return row ?? null;
  }

  async findByIdWithStatus(id: string): Promise<{ role: string; status: string } | null> {
    const [row] = await db.select({ status: drivers.status }).from(drivers).where(and(eq(drivers.id, id), isNull(drivers.deletedAt))).limit(1);
    return row ? { role: "DRIVER", status: row.status } : null;
  }

  async findPasswordById(id: string): Promise<{ id: string; password: string } | null> {
    const [row] = await db
      .select({ id: drivers.id, password: drivers.password })
      .from(drivers)
      .where(and(eq(drivers.id, id), isNull(drivers.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  async updateProfile(id: string, data: { fullName?: string; email?: string }): Promise<DriverWithProfile | null> {
    const [row] = await db
      .update(drivers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(drivers.id, id))
      .returning({
        id: drivers.id,
        fullName: drivers.fullName,
        email: drivers.email,
        status: drivers.status,
        rejectionReason: drivers.rejectionReason,
        banReason: drivers.banReason,
        deletedAt: drivers.deletedAt,
      });
    return row ?? null;
  }

  async updatePassword(id: string, password: string): Promise<void> {
    await db.update(drivers).set({ password, updatedAt: new Date() }).where(eq(drivers.id, id));
  }
}

export const driverRepository = new DriverRepository();
