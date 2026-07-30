import { and, eq, desc, inArray } from "drizzle-orm";
import { rides, rideLocations } from "@/infra/db/schema";
import type { RideStatus } from "@/infra/db/schema";
import { db } from "@/infra/db/drizzle";
import { ACTIVE_RIDE_STATUSES } from "@/constants/ride";
import type { IRideRepository, RideDetailedRow, CreateRideData, RideActiveRow } from "@/infra/postgres/contracts/IRideRepository";

function toRideDetailed(row: {
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
  createdAt: Date;
}): RideDetailedRow {
  return {
    id: row.id,
    clientId: row.clientId,
    driverId: row.driverId,
    pickup: {
      name: row.originName,
      lat: row.originLat,
      lng: row.originLng,
      h3: row.originH3,
    },
    destination: {
      name: row.destinationName,
      lat: row.destinationLat,
      lng: row.destinationLng,
      h3: row.destinationH3,
    },
    regionId: row.regionId,
    municipalityId: row.municipalityId,
    status: row.status as RideStatus,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    cancelledAt: row.cancelledAt,
    createdAt: row.createdAt,
  };
}

const SELECT_COLUMNS = {
  id: rides.id,
  clientId: rides.clientId,
  driverId: rides.driverId,
  originName: rideLocations.originName,
  originLat: rideLocations.originLat,
  originLng: rideLocations.originLng,
  originH3: rideLocations.originH3,
  destinationName: rideLocations.destinationName,
  destinationLat: rideLocations.destinationLat,
  destinationLng: rideLocations.destinationLng,
  destinationH3: rideLocations.destinationH3,
  regionId: rideLocations.regionId,
  municipalityId: rideLocations.municipalityId,
  status: rides.status,
  startedAt: rides.startedAt,
  completedAt: rides.completedAt,
  cancelledAt: rides.cancelledAt,
  createdAt: rides.createdAt,
} as const;

export class RideRepository implements IRideRepository {
  async findById(rideId: string): Promise<RideDetailedRow | null> {
    const [row] = await db
      .select(SELECT_COLUMNS)
      .from(rides)
      .innerJoin(rideLocations, eq(rides.id, rideLocations.rideId))
      .where(eq(rides.id, rideId))
      .limit(1);

    return row ? toRideDetailed(row) : null;
  }

  async findByClientId(clientId: string): Promise<RideDetailedRow[]> {
    const rows = await db
      .select(SELECT_COLUMNS)
      .from(rides)
      .innerJoin(rideLocations, eq(rides.id, rideLocations.rideId))
      .where(eq(rides.clientId, clientId))
      .orderBy(desc(rides.createdAt));

    return rows.map(toRideDetailed);
  }

  async findByDriverId(driverId: string): Promise<RideDetailedRow[]> {
    const rows = await db
      .select(SELECT_COLUMNS)
      .from(rides)
      .innerJoin(rideLocations, eq(rides.id, rideLocations.rideId))
      .where(eq(rides.driverId, driverId))
      .orderBy(desc(rides.createdAt));

    return rows.map(toRideDetailed);
  }

  async findActiveByClientId(clientId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: rides.id })
      .from(rides)
      .where(
        and(eq(rides.clientId, clientId), inArray(rides.status, ACTIVE_RIDE_STATUSES)),
      )
      .limit(1);
    return !!row;
  }

  async findActiveByDriverId(driverId: string): Promise<RideDetailedRow | null> {
    const [row] = await db
      .select(SELECT_COLUMNS)
      .from(rides)
      .innerJoin(rideLocations, eq(rides.id, rideLocations.rideId))
      .where(
        and(eq(rides.driverId, driverId), inArray(rides.status, ACTIVE_RIDE_STATUSES)),
      )
      .limit(1);

    return row ? toRideDetailed(row) : null;
  }

  async findActiveByIdAndClient(rideId: string, clientId: string): Promise<RideActiveRow | null> {
    const [row] = await db
      .select({ id: rides.id, clientId: rides.clientId, driverId: rides.driverId, status: rides.status })
      .from(rides)
      .where(
        and(
          eq(rides.id, rideId),
          eq(rides.clientId, clientId),
          inArray(rides.status, ACTIVE_RIDE_STATUSES),
        ),
      )
      .limit(1);

    return row ?? null;
  }

  async findActiveByIdAndDriver(rideId: string, driverId: string): Promise<RideDetailedRow | null> {
    const [row] = await db
      .select(SELECT_COLUMNS)
      .from(rides)
      .innerJoin(rideLocations, eq(rides.id, rideLocations.rideId))
      .where(
        and(
          eq(rides.id, rideId),
          eq(rides.driverId, driverId),
          inArray(rides.status, ACTIVE_RIDE_STATUSES),
        ),
      )
      .limit(1);

    return row ? toRideDetailed(row) : null;
  }

  async updateToCompleted(rideId: string): Promise<RideDetailedRow> {
    const [row] = await db
      .update(rides)
      .set({ status: "COMPLETED" as RideStatus, completedAt: new Date() })
      .where(eq(rides.id, rideId))
      .returning();

    const detailed = await this.findById(rideId);
    return detailed!;
  }

  async updateToCancelled(rideId: string): Promise<void> {
    await db
      .update(rides)
      .set({ status: "CANCELLED" as RideStatus, cancelledAt: new Date() })
      .where(eq(rides.id, rideId));
  }

  async createRideAndLocation(data: CreateRideData): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.insert(rides).values({
        id: data.id,
        clientId: data.clientId,
        driverId: data.driverId,
        status: data.status,
      });

      await tx.insert(rideLocations).values({
        rideId: data.id,
        originName: data.originName,
        originLat: data.originLat,
        originLng: data.originLng,
        originH3: data.originH3,
        destinationName: data.destinationName,
        destinationLat: data.destinationLat,
        destinationLng: data.destinationLng,
        destinationH3: data.destinationH3,
        regionId: data.regionId,
        municipalityId: data.municipalityId,
      });
    });
  }
}

export const rideRepository = new RideRepository();
export type { RideDetailedRow };
