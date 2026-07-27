import { and, eq, inArray } from "drizzle-orm";
import { drivers, rideLocations, rides } from "@/infra/db/schema";
import type { RideStatus } from "@/infra/db/schema";
import { db } from "@/infra/db/drizzle";
import type { IDriverRepository, DriverRow, CreateDriverData } from "@/contracts/IDriverRepository";

export class DriverRepository implements IDriverRepository {
  async create(data: CreateDriverData): Promise<DriverRow> {
    const [driver] = await db.insert(drivers).values(data).returning();
    return driver;
  }

  async findActiveRideByDriver(driverId: string): Promise<{
    rideId: string;
    passengerId: string;
    status: RideStatus;
    pickupLat: number;
    pickupLng: number;
  } | null> {
    const [row] = await db
      .select({
        rideId: rides.id,
        passengerId: rides.clientId,
        status: rides.status,
        pickupLat: rideLocations.originLat,
        pickupLng: rideLocations.originLng,
      })
      .from(rides)
      .innerJoin(rideLocations, eq(rides.id, rideLocations.rideId))
      .where(
        and(eq(rides.driverId, driverId), inArray(rides.status, ["DRIVER_ASSIGNED", "DRIVER_ARRIVING", "IN_PROGRESS"])),
      )
      .limit(1);

    return row ?? null;
  }
}

export const driverRepository = new DriverRepository();
export type { DriverRow, CreateDriverData };
