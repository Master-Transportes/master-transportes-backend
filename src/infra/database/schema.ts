import { sql } from "drizzle-orm";
import {
  pgTable,
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

export const ROLES = ["CLIENT", "ADMIN", "EMPLOYEE"] as const;
export type Role = (typeof ROLES)[number];

export const USER_STATUSES = ["ACTIVE", "BANNED", "INACTIVE"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const DRIVER_STATUSES = ["PENDING", "APPROVED", "REJECTED", "SUSPENDED", "BANNED"] as const;
export type DriverStatus = (typeof DRIVER_STATUSES)[number];

export const RIDE_STATUSES = ["DRIVER_ASSIGNED", "DRIVER_ARRIVING", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export type RideStatus = (typeof RIDE_STATUSES)[number];

export const geometry = customType<{ data: string }>({
  dataType() {
    return "geometry";
  },
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fullName: varchar("full_name", { length: 120 }).notNull(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    password: varchar("password").notNull(),
    role: varchar("role", { length: 20 }).$type<Role>().notNull().default("CLIENT"),
    status: varchar("status", { length: 20 }).$type<UserStatus>().notNull().default("ACTIVE"),
    banReason: varchar("ban_reason", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  table => [
    index("users_role_idx").on(table.role),
    index("users_status_idx").on(table.status),
    index("users_created_at_idx").on(table.createdAt),
    sql`CONSTRAINT users_role_check CHECK (${table.role} IN ('CLIENT', 'ADMIN', 'EMPLOYEE'))`,
    sql`CONSTRAINT users_status_check CHECK (${table.status} IN ('ACTIVE', 'BANNED', 'INACTIVE'))`,
  ],
);

export const drivers = pgTable(
  "drivers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fullName: varchar("full_name", { length: 120 }).notNull(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    password: varchar("password").notNull(),
    status: varchar("status", { length: 20 }).$type<DriverStatus>().notNull().default("PENDING"),
    rejectionReason: varchar("rejection_reason", { length: 255 }),
    banReason: varchar("ban_reason", { length: 255 }),
    approvedAt: timestamp("approved_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  table => [
    index("drivers_status_idx").on(table.status),
    index("drivers_created_at_idx").on(table.createdAt),
    sql`CONSTRAINT drivers_status_check CHECK (${table.status} IN ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED', 'BANNED'))`,
  ],
);

export const driverLicenses = pgTable(
  "driver_licenses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    driverId: uuid("driver_id")
      .notNull()
      .references(() => drivers.id, { onDelete: "cascade" }),
    cnh: varchar("cnh", { length: 20 }).notNull(),
    category: varchar("category", { length: 5 }).notNull(),
    validFrom: date("valid_from").notNull().defaultNow(),
    validUntil: date("valid_until"),
    isActive: boolean("is_active").default(false).notNull(),
    isVerified: boolean("is_verified").default(false),
    verifiedAt: timestamp("verified_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  table => [
    index("driver_licenses_driver_id_idx").on(table.driverId),
    uniqueIndex("driver_licenses_active_unique")
      .on(table.driverId)
      .where(sql`"is_active" = true`),
    uniqueIndex("driver_licenses_cnh_unique").on(table.cnh),
  ],
);

export const vehicles = pgTable(
  "vehicles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    driverId: uuid("driver_id")
      .notNull()
      .references(() => drivers.id, { onDelete: "cascade" }),
    brand: varchar("brand", { length: 50 }).notNull(),
    model: varchar("model", { length: 80 }).notNull(),
    year: integer("year").notNull(),
    color: varchar("color", { length: 30 }).notNull(),
    plate: varchar("plate", { length: 10 }).notNull().unique(),
    isActive: boolean("is_active").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  table => [
    index("vehicles_driver_id_idx").on(table.driverId),
    index("vehicles_plate_idx").on(table.plate),
    uniqueIndex("vehicles_active_unique")
      .on(table.driverId)
      .where(sql`"is_active" = true`),
  ],
);

export const rides = pgTable(
  "rides",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    driverId: uuid("driver_id")
      .notNull()
      .references(() => drivers.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 30 }).$type<RideStatus>().notNull().default("DRIVER_ASSIGNED"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    cancelledAt: timestamp("cancelled_at"),
    price: integer("price"),
    distance: integer("distance"),
    duration: integer("duration"),
    cancelledBy: varchar("cancelled_by", { length: 20 }),
    cancelReason: varchar("cancel_reason", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  table => [
    index("rides_client_id_idx").on(table.clientId),
    index("rides_driver_id_idx").on(table.driverId),
    index("rides_status_idx").on(table.status),
    index("rides_created_at_idx").on(table.createdAt),
    index("rides_client_id_status_idx").on(table.clientId, table.status),
    index("rides_driver_id_status_idx").on(table.driverId, table.status),
    sql`CONSTRAINT rides_status_check CHECK (${table.status} IN ('DRIVER_ASSIGNED', 'DRIVER_ARRIVING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'))`,
  ],
);

export const rideLocations = pgTable(
  "ride_locations",
  {
    rideId: uuid("ride_id")
      .notNull()
      .primaryKey()
      .references(() => rides.id, { onDelete: "cascade" }),
    originName: varchar("origin_name", { length: 200 }).notNull(),
    originLat: doublePrecision("origin_lat").notNull(),
    originLng: doublePrecision("origin_lng").notNull(),
    originH3: varchar("origin_h3", { length: 20 }).notNull(),
    destinationName: varchar("destination_name", { length: 200 }).notNull(),
    destinationLat: doublePrecision("destination_lat").notNull(),
    destinationLng: doublePrecision("destination_lng").notNull(),
    destinationH3: varchar("destination_h3", { length: 20 }).notNull(),
    regionId: varchar("region_id", { length: 30 }).notNull().default("am-interior"),
    municipalityId: varchar("municipality_id", { length: 20 }).notNull().default("unknown"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  table => [
    index("ride_locations_region_id_idx").on(table.regionId),
    index("ride_locations_municipality_id_idx").on(table.municipalityId),
  ],
);

export const areas = pgTable(
  "areas",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    municipality: varchar("municipality").notNull(),
    abbrevState: varchar("abbrev_state").notNull(),
    geometry: geometry("geometry"),
    cdMun: varchar("cd_mun").notNull(),
    cdUf: varchar("cd_uf").notNull(),
    nmUf: varchar("nm_uf").notNull(),
    cdRegia: varchar("cd_regia").notNull(),
    nmRegia: varchar("nm_regia").notNull(),
  },
  table => [
    index("areas_municipality_idx").on(table.municipality),
    index("areas_abbrev_state_idx").on(table.abbrevState),
    index("areas_geometry_idx").using("gist", table.geometry),
  ],
);
