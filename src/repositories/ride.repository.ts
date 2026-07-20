import { eq, desc } from "drizzle-orm";
import { rides, rideLocations } from "@/infra/db/schema";
import type { RideStatus } from "@/infra/db/schema";
import { DrizzleDatabase, drizzleDatabase } from "@/infra/adapters/drizzle-db.adapter";

export interface RideDetailedRow {
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
  status: RideStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
}

export interface IRideRepository {
  findByClientId(clientId: string): Promise<RideDetailedRow[]>;
  findByDriverId(driverId: string): Promise<RideDetailedRow[]>;
}

export class RideRepository implements IRideRepository {
  constructor(private readonly database: DrizzleDatabase) {}

  async findByClientId(clientId: string): Promise<RideDetailedRow[]> {
    return this.database.db
      .select({
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
      })
      .from(rides)
      .innerJoin(rideLocations, eq(rides.id, rideLocations.rideId))
      .where(eq(rides.clientId, clientId))
      .orderBy(desc(rides.createdAt));
  }

  async findByDriverId(driverId: string): Promise<RideDetailedRow[]> {
    return this.database.db
      .select({
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
      })
      .from(rides)
      .innerJoin(rideLocations, eq(rides.id, rideLocations.rideId))
      .where(eq(rides.driverId, driverId))
      .orderBy(desc(rides.createdAt));
  }
}

export const rideRepository = new RideRepository(drizzleDatabase);
