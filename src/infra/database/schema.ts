import { sql, desc } from "drizzle-orm";
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
  jsonb,
} from "drizzle-orm/pg-core";
import type {
  WalletTransactionType,
  WalletTransactionDirection,
  WalletTransactionStatus,
  PaymentStatus,
} from "./types";
export type {
  WalletTransactionType,
  WalletTransactionDirection,
  WalletTransactionStatus,
  PaymentStatus,
} from "./types";

export const ROLES = ["CLIENT", "ADMIN", "EMPLOYEE"] as const;
export type Role = (typeof ROLES)[number];

export const CLIENT_STATUSES = ["ACTIVE", "BANNED", "INACTIVE"] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const DRIVER_STATUSES = ["PENDING", "APPROVED", "REJECTED", "SUSPENDED", "BANNED"] as const;
export type DriverStatus = (typeof DRIVER_STATUSES)[number];

export const RIDE_STATUSES = ["DRIVER_ASSIGNED", "DRIVER_ARRIVING", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export type RideStatus = (typeof RIDE_STATUSES)[number];

export const WALLET_STATUSES = ["ACTIVE", "SUSPENDED", "CLOSED"] as const;
export type WalletStatus = (typeof WALLET_STATUSES)[number];

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fullName: varchar("full_name", { length: 120 }).notNull(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    cpf: varchar("cpf", { length: 11 }),
    cnpj: varchar("cnpj", { length: 14 }),
    password: varchar("password").notNull(),
    role: varchar("role", { length: 20 }).$type<Role>().notNull().default("CLIENT"),
    status: varchar("status", { length: 20 }).$type<ClientStatus>().notNull().default("ACTIVE"),
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
    cpf: varchar("cpf", { length: 11 }),
    cnpj: varchar("cnpj", { length: 14 }),
    pixKey: varchar("pix_key", { length: 255 }),
    pixKeyType: varchar("pix_key_type", { length: 10 }),
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

export const SESSION_USER_TYPES = ["CLIENT", "DRIVER"] as const;
export type SessionUserType = (typeof SESSION_USER_TYPES)[number];

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    userType: varchar("user_type", { length: 20 }).$type<SessionUserType>().notNull(),
    refreshTokenHash: varchar("refresh_token_hash", { length: 64 }).notNull(),
    deviceId: varchar("device_id", { length: 255 }),
    userAgent: varchar("user_agent", { length: 500 }),
    ipAddress: varchar("ip_address", { length: 45 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    revokedAt: timestamp("revoked_at"),
  },
  table => [
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_refresh_token_hash_idx").on(table.refreshTokenHash),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export type SessionRow = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export const wallets = pgTable(
  "wallets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id").notNull(),
    ownerType: varchar("owner_type", { length: 10 }).notNull(),
    balance: integer("balance").notNull().default(0),
    currency: varchar("currency", { length: 3 }).notNull().default("BRL"),
    status: varchar("status", { length: 20 }).$type<WalletStatus>().notNull().default("ACTIVE"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("wallets_owner_unique").on(table.ownerId, table.ownerType),
    index("wallets_status_idx").on(table.status),
    sql`CONSTRAINT wallets_status_check CHECK (${table.status} IN ('ACTIVE', 'SUSPENDED', 'CLOSED'))`,
    sql`CONSTRAINT wallets_balance_check CHECK (${table.balance} >= 0)`,
    sql`CONSTRAINT wallets_owner_type_check CHECK (${table.ownerType} IN ('USER', 'DRIVER'))`,
  ],
);

export const walletTransactions = pgTable(
  "wallet_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "cascade" }),
    rideId: uuid("ride_id").references(() => rides.id, { onDelete: "set null" }),
    type: varchar("type", { length: 30 }).$type<WalletTransactionType>().notNull(),
    direction: varchar("direction", { length: 6 }).$type<WalletTransactionDirection>().notNull(),
    amount: integer("amount").notNull(),
    status: varchar("status", { length: 20 }).$type<WalletTransactionStatus>().notNull(),
    reference: varchar("reference", { length: 255 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  table => [
    index("wallet_transactions_wallet_id_idx").on(table.walletId),
    index("wallet_transactions_wallet_id_created_at_idx").on(table.walletId, desc(table.createdAt)),
    index("wallet_transactions_ride_id_idx").on(table.rideId),
    index("wallet_transactions_type_idx").on(table.type),
    index("wallet_transactions_status_idx").on(table.status),
    index("wallet_transactions_created_at_idx").on(table.createdAt),
    sql`CONSTRAINT wallet_transactions_type_check CHECK (${table.type} IN ('DEPOSIT', 'RIDE_EARNING', 'PAYOUT', 'ADJUSTMENT', 'REFUND'))`,
    sql`CONSTRAINT wallet_transactions_direction_check CHECK (${table.direction} IN ('CREDIT', 'DEBIT'))`,
    sql`CONSTRAINT wallet_transactions_status_check CHECK (${table.status} IN ('PENDING', 'COMPLETED', 'FAILED', 'REVERSED'))`,
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("BRL"),
    provider: varchar("provider", { length: 30 }).notNull().default("ASAAS"),
    providerPaymentId: varchar("provider_payment_id", { length: 255 }),
    status: varchar("status", { length: 20 }).$type<PaymentStatus>().notNull().default("PENDING"),
    description: varchar("description", { length: 500 }),
    paidAt: timestamp("paid_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  table => [
    index("payments_wallet_id_idx").on(table.walletId),
    index("payments_customer_id_idx").on(table.customerId),
    index("payments_provider_payment_id_idx").on(table.providerPaymentId),
    uniqueIndex("payments_provider_unique")
      .on(table.providerPaymentId)
      .where(sql`${table.providerPaymentId} IS NOT NULL`),
    sql`CONSTRAINT payments_status_check CHECK (${table.status} IN ('PENDING', 'CONFIRMED', 'RECEIVED', 'CANCELLED', 'REFUNDED', 'OVERDUE'))`,
  ],
);

export const paymentWebhookEvents = pgTable(
  "payment_webhook_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: varchar("provider", { length: 30 }).notNull(),
    externalEventId: varchar("external_event_id", { length: 255 }).notNull(),
    eventType: varchar("event_type", { length: 50 }).notNull(),
    payload: jsonb("payload").notNull(),
    processedAt: timestamp("processed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  _table => [sql`CONSTRAINT webhook_event_unique UNIQUE ("provider", "external_event_id")`],
);
