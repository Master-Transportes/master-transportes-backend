import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  integer,
  timestamp,
  doublePrecision,
  index,
  uniqueIndex,
  boolean,
  date,
  customType,
} from "drizzle-orm/pg-core";

export const Role = pgEnum("Role", ["DRIVER", "CLIENT", "ADMIN", "EMPLOYEE"]);
export type Role = "DRIVER" | "CLIENT" | "ADMIN" | "EMPLOYEE";

export const UserStatus = pgEnum("UserStatus", ["ACTIVE", "BANNED", "INACTIVE"]);
export type UserStatus = "ACTIVE" | "BANNED" | "INACTIVE";

export const DriverStatus = pgEnum("DriverStatus", ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"]);
export type DriverStatus = "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";

export const RideStatus = pgEnum("RideStatus", [
  "DRIVER_ASSIGNED",
  "DRIVER_ARRIVING",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
]);
export type RideStatus = "DRIVER_ASSIGNED" | "DRIVER_ARRIVING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export const geometry = customType<{ data: string }>({
  dataType() {
    return "geometry";
  },
});

export const users = pgTable(
  "User",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fullName: varchar("fullName", { length: 120 }).notNull(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    password: varchar("password").notNull(),
    role: Role("role").default("CLIENT").notNull(),
    status: UserStatus("status").default("ACTIVE").notNull(),
    banReason: varchar("banReason", { length: 255 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [index("User_role_idx").on(table.role), index("User_createdAt_idx").on(table.createdAt)],
);

export const drivers = pgTable(
  "Driver",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("userId").unique().references(() => users.id),
    fullName: varchar("fullName", { length: 120 }).notNull(),
    status: DriverStatus("status").default("PENDING").notNull(),
    rejectionReason: varchar("rejectionReason", { length: 255 }),
    approvedAt: timestamp("approvedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [
    index("Driver_status_idx").on(table.status),
    index("Driver_userId_idx").on(table.userId),
  ],
);

export const driverLicenses = pgTable(
  "DriverLicense",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    driverId: uuid("driverId")
      .notNull()
      .references(() => drivers.id),
    cnh: varchar("cnh", { length: 20 }).notNull(),
    category: varchar("category", { length: 5 }).notNull(),
    validFrom: date("validFrom").notNull().defaultNow(),
    validUntil: date("validUntil"),
    isActive: boolean("isActive").default(false).notNull(),
    isVerified: boolean("isVerified").default(false),
    verifiedAt: timestamp("verifiedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [
    index("DriverLicense_driverId_idx").on(table.driverId),
    uniqueIndex("DriverLicense_active_unique")
      .on(table.driverId)
      .where(sql`"isActive" = true`),
  ],
);

export const driverCredentials = pgTable(
  "DriverCredential",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    driverId: uuid("driverId")
      .notNull()
      .unique()
      .references(() => drivers.id),
    email: varchar("email", { length: 255 }).notNull().unique(),
    password: varchar("password").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [index("DriverCredential_email_idx").on(table.email)],
);

export const vehicles = pgTable(
  "Vehicle",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    driverId: uuid("driverId")
      .notNull()
      .references(() => drivers.id),
    brand: varchar("brand", { length: 50 }).notNull(),
    model: varchar("model", { length: 80 }).notNull(),
    year: integer("year").notNull(),
    color: varchar("color", { length: 30 }).notNull(),
    plate: varchar("plate", { length: 10 }).notNull().unique(),
    isActive: boolean("isActive").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [
    index("Vehicle_driverId_idx").on(table.driverId),
    index("Vehicle_plate_idx").on(table.plate),
    uniqueIndex("Vehicle_active_unique")
      .on(table.driverId)
      .where(sql`"isActive" = true`),
  ],
);

export const rides = pgTable(
  "Ride",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientId: uuid("clientId")
      .notNull()
      .references(() => users.id),
    driverId: uuid("driverId")
      .notNull()
      .references(() => drivers.id),
    status: RideStatus("status").default("DRIVER_ASSIGNED").notNull(),
    startedAt: timestamp("startedAt"),
    completedAt: timestamp("completedAt"),
    cancelledAt: timestamp("cancelledAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [
    index("Ride_clientId_idx").on(table.clientId),
    index("Ride_driverId_idx").on(table.driverId),
    index("Ride_status_idx").on(table.status),
    index("Ride_createdAt_idx").on(table.createdAt),
    index("Ride_client_active_idx")
      .on(table.clientId)
      .where(sql`"status" IN ('DRIVER_ASSIGNED', 'DRIVER_ARRIVING', 'IN_PROGRESS')`),
    index("Ride_driver_active_idx")
      .on(table.driverId)
      .where(sql`"status" IN ('DRIVER_ASSIGNED', 'DRIVER_ARRIVING', 'IN_PROGRESS')`),
  ],
);

export const rideLocations = pgTable(
  "RideLocation",
  {
    rideId: uuid("rideId")
      .notNull()
      .primaryKey()
      .references(() => rides.id),
    originName: varchar("originName", { length: 200 }).notNull(),
    originLat: doublePrecision("originLat").notNull(),
    originLng: doublePrecision("originLng").notNull(),
    originH3: varchar("originH3", { length: 20 }).notNull(),
    destinationName: varchar("destinationName", { length: 200 }).notNull(),
    destinationLat: doublePrecision("destinationLat").notNull(),
    destinationLng: doublePrecision("destinationLng").notNull(),
    destinationH3: varchar("destinationH3", { length: 20 }).notNull(),
    regionId: varchar("regionId", { length: 30 }).notNull().default("am-interior"),
    municipalityId: varchar("municipalityId", { length: 20 }).notNull().default("unknown"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [
    index("RideLocation_regionId_idx").on(table.regionId),
    index("RideLocation_municipalityId_idx").on(table.municipalityId),
  ],
);

export const areas = pgTable(
  "Area",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    municipality: varchar("municipality").notNull(),
    abbrevState: varchar("abbrevState").notNull(),
    geometry: geometry("geometry"),
    cdMun: varchar("cdMun").notNull(),
    cdUf: varchar("cdUf").notNull(),
    nmUf: varchar("nmUf").notNull(),
    cdRegia: varchar("cdRegia").notNull(),
    nmRegia: varchar("nmRegia").notNull(),
  },
  table => [
    index("Area_municipality_idx").on(table.municipality),
    index("Area_abbrevState_idx").on(table.abbrevState),
    index("Area_geometry_idx").using("gist", table.geometry),
  ],
);
