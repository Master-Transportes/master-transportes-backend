import { and, eq, desc, inArray, isNull, type SQL } from "drizzle-orm";
import { rides, rideLocations, drivers, vehicles } from "@/infra/database/schema";
import type { RideStatus } from "@/infra/database/schema";
import { db } from "@/infra/database/drizzle";
import type {
  IRideRepository,
  RideDetailedRow,
  CreateRideData,
  RideActiveRow,
  RideWithDriverRow,
} from "./contracts/IRideRepository";
import { toRideDetailedRow, toRideWithDriverRow } from "./mappers";

const RIDE_SELECT_COLUMNS = {
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
  price: rides.price,
  distance: rides.distance,
  duration: rides.duration,
  cancelledBy: rides.cancelledBy,
  cancelReason: rides.cancelReason,
  createdAt: rides.createdAt,
  deletedAt: rides.deletedAt,
} as const;

export class RideRepository implements IRideRepository {
  async findById(rideId: string): Promise<RideDetailedRow | null> {
    const [row] = await db
      .select(RIDE_SELECT_COLUMNS)
      .from(rides)
      .innerJoin(rideLocations, eq(rides.id, rideLocations.rideId))
      .where(and(eq(rides.id, rideId), isNull(rides.deletedAt)))
      .limit(1);

    return row ? toRideDetailedRow(row) : null;
  }

  async findByClientId(clientId: string): Promise<RideDetailedRow[]> {
    const rows = await db
      .select(RIDE_SELECT_COLUMNS)
      .from(rides)
      .innerJoin(rideLocations, eq(rides.id, rideLocations.rideId))
      .where(and(eq(rides.clientId, clientId), isNull(rides.deletedAt)))
      .orderBy(desc(rides.createdAt));

    return rows.map(toRideDetailedRow);
  }

  async findByDriverId(driverId: string): Promise<RideDetailedRow[]> {
    const rows = await db
      .select(RIDE_SELECT_COLUMNS)
      .from(rides)
      .innerJoin(rideLocations, eq(rides.id, rideLocations.rideId))
      .where(and(eq(rides.driverId, driverId), isNull(rides.deletedAt)))
      .orderBy(desc(rides.createdAt));

    return rows.map(toRideDetailedRow);
  }

  async findActiveByClientId(clientId: string, statuses: RideStatus[]): Promise<boolean> {
    const [row] = await db
      .select({ id: rides.id })
      .from(rides)
      .where(and(eq(rides.clientId, clientId), inArray(rides.status, statuses), isNull(rides.deletedAt)))
      .limit(1);
    return !!row;
  }

  async findActiveByDriverId(driverId: string, statuses: RideStatus[]): Promise<RideDetailedRow | null> {
    return this.queryActiveDetailed(and(eq(rides.driverId, driverId), inArray(rides.status, statuses)));
  }

  async findActiveByClientDetailed(clientId: string, statuses: RideStatus[]): Promise<RideWithDriverRow | null> {
    const [row] = await db
      .select({
        ...RIDE_SELECT_COLUMNS,
        driverFullName: drivers.fullName,
        vehicleBrand: vehicles.brand,
        vehicleModel: vehicles.model,
        vehicleYear: vehicles.year,
        vehicleColor: vehicles.color,
        vehiclePlate: vehicles.plate,
      })
      .from(rides)
      .innerJoin(rideLocations, eq(rides.id, rideLocations.rideId))
      .innerJoin(drivers, eq(rides.driverId, drivers.id))
      .leftJoin(vehicles, and(eq(vehicles.driverId, rides.driverId), eq(vehicles.isActive, true)))
      .where(and(eq(rides.clientId, clientId), inArray(rides.status, statuses), isNull(rides.deletedAt)))
      .limit(1);

    return row ? toRideWithDriverRow(row) : null;
  }

  private async queryActiveDetailed(where: SQL | undefined): Promise<RideDetailedRow | null> {
    const [row] = await db
      .select(RIDE_SELECT_COLUMNS)
      .from(rides)
      .innerJoin(rideLocations, eq(rides.id, rideLocations.rideId))
      .where(and(where, isNull(rides.deletedAt)))
      .limit(1);

    return row ? toRideDetailedRow(row) : null;
  }

  async findActiveByIdAndClient(
    rideId: string,
    clientId: string,
    statuses: RideStatus[],
  ): Promise<RideActiveRow | null> {
    const [row] = await db
      .select({
        id: rides.id,
        clientId: rides.clientId,
        driverId: rides.driverId,
        status: rides.status,
        price: rides.price,
        distance: rides.distance,
        duration: rides.duration,
        cancelledBy: rides.cancelledBy,
        cancelReason: rides.cancelReason,
        deletedAt: rides.deletedAt,
      })
      .from(rides)
      .where(
        and(
          eq(rides.id, rideId),
          eq(rides.clientId, clientId),
          inArray(rides.status, statuses),
          isNull(rides.deletedAt),
        ),
      )
      .limit(1);

    return row ?? null;
  }

  async findActiveByIdAndDriver(
    rideId: string,
    driverId: string,
    statuses: RideStatus[],
  ): Promise<RideDetailedRow | null> {
    const [row] = await db
      .select(RIDE_SELECT_COLUMNS)
      .from(rides)
      .innerJoin(rideLocations, eq(rides.id, rideLocations.rideId))
      .where(
        and(
          eq(rides.id, rideId),
          eq(rides.driverId, driverId),
          inArray(rides.status, statuses),
          isNull(rides.deletedAt),
        ),
      )
      .limit(1);

    return row ? toRideDetailedRow(row) : null;
  }

  async updateToCompleted(rideId: string): Promise<RideDetailedRow | null> {
    await db
      .update(rides)
      .set({ status: "COMPLETED" as RideStatus, completedAt: new Date() })
      .where(eq(rides.id, rideId));

    return this.findById(rideId);
  }

  async updateToCancelled(rideId: string, cancelledBy: string, cancelReason?: string | null): Promise<void> {
    await db
      .update(rides)
      .set({
        status: "CANCELLED" as RideStatus,
        cancelledAt: new Date(),
        cancelledBy,
        cancelReason: cancelReason ?? null,
      })
      .where(eq(rides.id, rideId));
  }

  async createRideAndLocation(data: CreateRideData): Promise<void> {
    await db.transaction(async tx => {
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
