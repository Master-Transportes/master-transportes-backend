import type { RideStatus } from "@/infra/database/schema";
import type { RideDetailedRow, RideWithDriverRow } from "../contracts/IRideRepository";
import type { RideDbRow, RideWithDriverDbRow } from "../contracts/types";

export function toRideDetailedRow(row: RideDbRow): RideDetailedRow {
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

export function toRideWithDriverRow(row: RideWithDriverDbRow): RideWithDriverRow {
  const ride = toRideDetailedRow(row);
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
