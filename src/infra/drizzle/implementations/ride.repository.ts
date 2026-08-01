import { and, eq, desc, inArray, isNull, type SQL } from "drizzle-orm";
import { rides, rideLocations, drivers, vehicles } from "../schema";
import type { RideStatus } from "../schema";
import { db } from "../drizzle";
import { ACTIVE_RIDE_STATUSES } from "@/constants/ride";
import type {
  IRideRepository,
  RideDetailedRow,
  CreateRideData,
  RideActiveRow,
  RideWithDriverRow,
} from "../contracts/IRideRepository";

type RideRow = {
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
  price: number | null;
  distance: number | null;
  duration: number | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  createdAt: Date;
  deletedAt: Date | null;
};

type RideWithDriverRowShape = RideRow & {
  driverFullName: string;
  vehicleBrand: string | null;
  vehicleModel: string | null;
  vehicleYear: number | null;
  vehicleColor: string | null;
  vehiclePlate: string | null;
};

function toRideDetailed(row: RideRow): RideDetailedRow {
  return {
    id: row.id,
    clientId: row.clientId,
    driverId: row.driverId,
    origin: {
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
    price: row.price,
    distance: row.distance,
    duration: row.duration,
    cancelledBy: row.cancelledBy,
    cancelReason: row.cancelReason,
    createdAt: row.createdAt,
    deletedAt: row.deletedAt,
  };
}

function toRideWithDriver(row: RideWithDriverRowShape): RideWithDriverRow {
  const ride = toRideDetailed(row);
  return {
    ...ride,
    driver: {
      name: row.driverFullName,
      photo: null,
      vehicle: row.vehiclePlate
        ? {
            brand: row.vehicleBrand!,
            model: row.vehicleModel!,
            year: row.vehicleYear!,
            color: row.vehicleColor!,
            plate: row.vehiclePlate,
          }
        : null,
    },
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
      .select(SELECT_COLUMNS)
      .from(rides)
      .innerJoin(rideLocations, eq(rides.id, rideLocations.rideId))
      .where(and(eq(rides.id, rideId), isNull(rides.deletedAt)))
      .limit(1);

    return row ? toRideDetailed(row) : null;
  }

  async findByClientId(clientId: string): Promise<RideDetailedRow[]> {
    const rows = await db
      .select(SELECT_COLUMNS)
      .from(rides)
      .innerJoin(rideLocations, eq(rides.id, rideLocations.rideId))
      .where(and(eq(rides.clientId, clientId), isNull(rides.deletedAt)))
      .orderBy(desc(rides.createdAt));

    return rows.map(toRideDetailed);
  }

  async findByDriverId(driverId: string): Promise<RideDetailedRow[]> {
    const rows = await db
      .select(SELECT_COLUMNS)
      .from(rides)
      .innerJoin(rideLocations, eq(rides.id, rideLocations.rideId))
      .where(and(eq(rides.driverId, driverId), isNull(rides.deletedAt)))
      .orderBy(desc(rides.createdAt));

    return rows.map(toRideDetailed);
  }

  async findActiveByClientId(clientId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: rides.id })
      .from(rides)
      .where(and(eq(rides.clientId, clientId), inArray(rides.status, ACTIVE_RIDE_STATUSES), isNull(rides.deletedAt)))
      .limit(1);
    return !!row;
  }

  async findActiveByDriverId(driverId: string): Promise<RideDetailedRow | null> {
    return this.queryActiveDetailed(and(eq(rides.driverId, driverId), inArray(rides.status, ACTIVE_RIDE_STATUSES)));
  }

  async findActiveByClientDetailed(clientId: string): Promise<RideWithDriverRow | null> {
    const [row] = await db
      .select({
        ...SELECT_COLUMNS,
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
      .where(and(eq(rides.clientId, clientId), inArray(rides.status, ACTIVE_RIDE_STATUSES), isNull(rides.deletedAt)))
      .limit(1);

    return row ? toRideWithDriver(row) : null;
  }

  private async queryActiveDetailed(where: SQL | undefined): Promise<RideDetailedRow | null> {
    const [row] = await db
      .select(SELECT_COLUMNS)
      .from(rides)
      .innerJoin(rideLocations, eq(rides.id, rideLocations.rideId))
      .where(and(where, isNull(rides.deletedAt)))
      .limit(1);

    return row ? toRideDetailed(row) : null;
  }

  async findActiveByIdAndClient(rideId: string, clientId: string): Promise<RideActiveRow | null> {
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
      .where(and(eq(rides.id, rideId), eq(rides.clientId, clientId), inArray(rides.status, ACTIVE_RIDE_STATUSES), isNull(rides.deletedAt)))
      .limit(1);

    return row ?? null;
  }

  async findActiveByIdAndDriver(rideId: string, driverId: string): Promise<RideDetailedRow | null> {
    const [row] = await db
      .select(SELECT_COLUMNS)
      .from(rides)
      .innerJoin(rideLocations, eq(rides.id, rideLocations.rideId))
      .where(and(eq(rides.id, rideId), eq(rides.driverId, driverId), inArray(rides.status, ACTIVE_RIDE_STATUSES), isNull(rides.deletedAt)))
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
      .set({ status: "CANCELLED" as RideStatus, cancelledAt: new Date(), cancelledBy: "system", cancelReason: null })
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
