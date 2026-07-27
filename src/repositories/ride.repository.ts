import { eq, desc } from "drizzle-orm";
import { rides, rideLocations } from "@/infra/db/schema";
import { db } from "@/infra/db/drizzle";
import type { IRideRepository, RideDetailedRow } from "@/contracts/IRideRepository";

export class RideRepository implements IRideRepository {
  async findByClientId(clientId: string): Promise<RideDetailedRow[]> {
    return db
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
    return db
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

export const rideRepository = new RideRepository();
export type { RideDetailedRow };
