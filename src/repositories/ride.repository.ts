import { and, eq, desc, inArray } from "drizzle-orm";
import { rides, rideLocations, RideStatus } from "@/infra/db/schema";
import { db } from "@/infra/db/drizzle";
import type { IRideRepository, RideDetailedRow } from "@/contracts/IRideRepository";

function toRideDetailed(row: {
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
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
}): RideDetailedRow {
  return {
    id: row.id,
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
        and(eq(rides.clientId, clientId), inArray(rides.status, ["DRIVER_ASSIGNED", "DRIVER_ARRIVING", "IN_PROGRESS"])),
      )
      .limit(1);
    return !!row;
  }
}

export const rideRepository = new RideRepository();
export type { RideDetailedRow };
