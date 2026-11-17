import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  date,
  timestamp,
  numeric,
  index,
  uniqueIndex,
  primaryKey,
  check,
  foreignKey,
} from "drizzle-orm/pg-core";
import { AccountStatus, ROLES, ACCOUNT_STATUSES } from "@/domain/identity/identity.types";
import {
  DRIVER_STATUSES,
  DRIVER_DOCUMENT_TYPES,
  DRIVER_DOCUMENT_VERIFICATION_STATUSES,
  DriverStatus,
  DriverDocumentVerificationStatus,
} from "@/domain/driver/driver.types";

// ---------------------------------------------------------------------------
// Enums PostgreSQL
// ---------------------------------------------------------------------------
export const userRoleEnum = pgEnum("user_role", ROLES);
export const accountStatusEnum = pgEnum("account_status", ACCOUNT_STATUSES);
export const driverStatusEnum = pgEnum("driver_status", DRIVER_STATUSES);
export const documentTypeEnum = pgEnum("document_type", DRIVER_DOCUMENT_TYPES);
export const documentVerificationStatusEnum = pgEnum(
  "document_verification_status",
  DRIVER_DOCUMENT_VERIFICATION_STATUSES,
);
// Enum legado das migrations 0001–0002. Não é usado por nenhuma tabela nova;
// permanece para compatibilidade do histórico de migrations.
export const legacyRideStatusEnum = pgEnum("ride_status", [
  "SEARCHING",
  "ACCEPTED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
]);

// Solicitação de transporte ≠ corrida confirmada. A solicitação tem seu próprio
// ciclo de vida; a corrida só nasce quando um motorista aceita.
export const rideRequestStatusEnum = pgEnum("ride_request_status", [
  "SEARCHING",
  "ACCEPTED",
  "EXPIRED",
  "CANCELLED",
  "COMPLETED",
]);
export const confirmedRideStatusEnum = pgEnum("confirmed_ride_status", [
  "ACCEPTED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
]);
export const rideOfferStatusEnum = pgEnum("ride_offer_status", [
  "PENDING",
  "ACCEPTED",
  "REJECTED",
  "EXPIRED",
  "CANCELLED",
]);

/** Todos os timestamps são timestamptz em UTC (armazenamento independente de fuso). */
const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

// ---------------------------------------------------------------------------
// users — identidade única de qualquer pessoa na plataforma
// ---------------------------------------------------------------------------
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fullName: varchar("full_name", { length: 150 }).notNull(),
    email: varchar("email", { length: 254 }).notNull(),
    phone: varchar("phone", { length: 20 }),
    cpf: varchar("cpf", { length: 11 }),
    passwordHash: text("password_hash").notNull(),
    status: accountStatusEnum("status").notNull().default(AccountStatus.ACTIVE),
    emailVerifiedAt: timestamptz("email_verified_at"),
    phoneVerifiedAt: timestamptz("phone_verified_at"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
    deletedAt: timestamptz("deleted_at"),
  },
  t => [
    // E-mail único entre usuários não excluídos, sem distinção de maiúsculas/minúsculas.
    // O índice NÃO filtra status: contas INACTIVE/BANNED ainda bloqueiam o e-mail.
    uniqueIndex("users_email_lower_unique")
      .on(sql`lower(${t.email})`)
      .where(sql`deleted_at IS NULL`),
    // CPF único quando informado; NULL não conflita na semântica do índice único.
    uniqueIndex("users_cpf_unique")
      .on(t.cpf)
      .where(sql`deleted_at IS NULL`),
    index("users_status_idx").on(t.status),
    check("users_full_name_not_blank", sql`length(trim(full_name)) > 0`),
    check("users_email_not_blank", sql`length(trim(email)) > 0`),
    check("users_password_hash_not_blank", sql`length(password_hash) > 0`),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// ---------------------------------------------------------------------------
// user_roles — papéis múltiplos por conta (CLIENT + DRIVER simultâneos)
// ---------------------------------------------------------------------------
export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: userRoleEnum("role").notNull(),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
  },
  t => [primaryKey({ columns: [t.userId, t.role], name: "user_roles_pkey" }), index("user_roles_role_idx").on(t.role)],
);

export type UserRoleRow = typeof userRoles.$inferSelect;
export type NewUserRole = typeof userRoles.$inferInsert;

// ---------------------------------------------------------------------------
// driver_profiles — 1:0..1 com users; nunca duplica dados de identidade
// ---------------------------------------------------------------------------
export const driverProfiles = pgTable(
  "driver_profiles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: driverStatusEnum("status").notNull().default(DriverStatus.PENDING),
    reviewedAt: timestamptz("reviewed_at"),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    rejectionReason: text("rejection_reason"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
    deletedAt: timestamptz("deleted_at"),
  },
  t => [
    primaryKey({ columns: [t.userId], name: "driver_profiles_pkey" }),
    index("driver_profiles_status_idx").on(t.status),
  ],
);

export type DriverProfileRow = typeof driverProfiles.$inferSelect;
export type NewDriverProfile = typeof driverProfiles.$inferInsert;

// ---------------------------------------------------------------------------
// driver_documents — metadados de documentos do motorista (sem binários/URLs)
// ---------------------------------------------------------------------------
export const driverDocuments = pgTable(
  "driver_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    driverUserId: uuid("driver_user_id")
      .notNull()
      .references(() => driverProfiles.userId, { onDelete: "cascade" }),
    type: documentTypeEnum("type").notNull(),
    documentNumber: varchar("document_number", { length: 40 }),
    licenseCategory: varchar("license_category", { length: 10 }),
    issuedOn: date("issued_on", { mode: "string" }),
    expiresOn: date("expires_on", { mode: "string" }),
    storageKey: text("storage_key"),
    verificationStatus: documentVerificationStatusEnum("verification_status")
      .notNull()
      .default(DriverDocumentVerificationStatus.PENDING),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamptz("reviewed_at"),
    rejectionReason: text("rejection_reason"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
    deletedAt: timestamptz("deleted_at"),
  },
  t => [
    // Apenas um documento ATIVO (não removido) por tipo por motorista:
    // substituição = soft delete do anterior + nova linha (histórico preservado).
    uniqueIndex("driver_documents_active_unique")
      .on(t.driverUserId, t.type)
      .where(sql`deleted_at IS NULL`),
    index("driver_documents_expires_on_idx").on(t.expiresOn),
    check("driver_documents_dates_check", sql`expires_on IS NULL OR issued_on IS NULL OR expires_on >= issued_on`),
    // license_category só é válido para CNH (mantenha em sincronia com DRIVER_DOCUMENT_TYPES).
    check("driver_documents_category_type_check", sql`license_category IS NULL OR type = 'CNH'`),
    // Categorias de CNH válidas: A, B, C, D, E, AC, AD, AE.
    check(
      "driver_documents_category_values_check",
      sql`license_category IS NULL OR license_category IN ('A', 'B', 'C', 'D', 'E', 'AC', 'AD', 'AE')`,
    ),
  ],
);

export type DriverDocumentRow = typeof driverDocuments.$inferSelect;
export type NewDriverDocument = typeof driverDocuments.$inferInsert;

// ---------------------------------------------------------------------------
// sessions — sessões de autenticação ligadas diretamente a users
// (sem userType, sem deviceId/userAgent/ipAddress/lastSeenAt)
// ---------------------------------------------------------------------------
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    refreshTokenHash: varchar("refresh_token_hash", { length: 64 }).notNull(),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    revokedAt: timestamptz("revoked_at"),
  },
  t => [
    index("sessions_user_id_idx").on(t.userId),
    index("sessions_refresh_token_hash_idx").on(t.refreshTokenHash),
    index("sessions_expires_at_idx").on(t.expiresAt),
  ],
);

export type SessionRow = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

// ---------------------------------------------------------------------------
// ride_requests — solicitação de transporte, ainda NÃO é uma corrida confirmada
// ---------------------------------------------------------------------------
export const rideRequests = pgTable(
  "ride_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    passengerId: uuid("passenger_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: rideRequestStatusEnum("status").notNull().default("SEARCHING"),
    originLat: numeric("origin_lat", { precision: 9, scale: 6 }).notNull(),
    originLng: numeric("origin_lng", { precision: 9, scale: 6 }).notNull(),
    originAddress: text("origin_address").notNull(),
    destinationLat: numeric("destination_lat", { precision: 9, scale: 6 }).notNull(),
    destinationLng: numeric("destination_lng", { precision: 9, scale: 6 }).notNull(),
    destinationAddress: text("destination_address").notNull(),
    // Prazo máximo de busca, definido pelo servidor/banco. Uma solicitação
    // vencida é reconciliada para EXPIRED de forma lazy em toda leitura/escrita.
    searchExpiresAt: timestamptz("search_expires_at").notNull(),
    acceptedAt: timestamptz("accepted_at"),
    cancelledAt: timestamptz("cancelled_at"),
    cancelledByUserId: uuid("cancelled_by_user_id").references(() => users.id, { onDelete: "restrict" }),
    cancellationReason: text("cancellation_reason"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
  },
  t => [
    index("ride_requests_passenger_history_idx").on(t.passengerId, t.createdAt),
    // Sweep/reconciliação lazy de solicitações vencidas.
    index("ride_requests_status_expires_idx").on(t.status, t.searchExpiresAt),
    // No máximo uma solicitação aberta/aceita por passageiro. Expiradas e
    // canceladas não bloqueiam nova solicitação.
    uniqueIndex("ride_requests_passenger_open_unique")
      .on(t.passengerId)
      .where(sql`status IN ('SEARCHING', 'ACCEPTED')`),
    // Necessário para a FK composta de rides (request_id + passenger_id).
    uniqueIndex("ride_requests_id_passenger_unique").on(t.id, t.passengerId),
    check("ride_requests_origin_coords_check", sql`origin_lat BETWEEN -90 AND 90 AND origin_lng BETWEEN -180 AND 180`),
    check(
      "ride_requests_destination_coords_check",
      sql`destination_lat BETWEEN -90 AND 90 AND destination_lng BETWEEN -180 AND 180`,
    ),
    check("ride_requests_origin_address_not_blank", sql`length(trim(origin_address)) > 0`),
    check("ride_requests_destination_address_not_blank", sql`length(trim(destination_address)) > 0`),
    check("ride_requests_search_window_check", sql`search_expires_at > created_at`),
    check(
      "ride_requests_searching_state_check",
      sql`status <> 'SEARCHING' OR (
        accepted_at IS NULL AND cancelled_at IS NULL AND cancelled_by_user_id IS NULL
      )`,
    ),
    check(
      "ride_requests_accepted_state_check",
      sql`status <> 'ACCEPTED' OR (
        accepted_at IS NOT NULL AND cancelled_at IS NULL AND cancelled_by_user_id IS NULL
      )`,
    ),
    check(
      "ride_requests_expired_state_check",
      sql`status <> 'EXPIRED' OR (
        accepted_at IS NULL AND cancelled_at IS NULL AND cancelled_by_user_id IS NULL
      )`,
    ),
    check(
      "ride_requests_completed_state_check",
      sql`status <> 'COMPLETED' OR (
        accepted_at IS NOT NULL AND cancelled_at IS NULL AND cancelled_by_user_id IS NULL
      )`,
    ),
    check(
      "ride_requests_cancelled_state_check",
      sql`status <> 'CANCELLED' OR (cancelled_at IS NOT NULL AND cancelled_by_user_id IS NOT NULL)`,
    ),
    check("ride_requests_cancelled_by_state_check", sql`cancelled_by_user_id IS NULL OR status = 'CANCELLED'`),
    check("ride_requests_cancelled_at_state_check", sql`cancelled_at IS NULL OR status = 'CANCELLED'`),
  ],
);

export type RideRequestRow = typeof rideRequests.$inferSelect;
export type NewRideRequest = typeof rideRequests.$inferInsert;

// ---------------------------------------------------------------------------
// rides — corrida efetivamente confirmada; só existe após aceite válido.
// Sem soft delete; FKs restrict preservam o histórico.
// ---------------------------------------------------------------------------
export const rides = pgTable(
  "rides",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    rideRequestId: uuid("ride_request_id")
      .notNull()
      .references(() => rideRequests.id, { onDelete: "restrict" }),
    passengerId: uuid("passenger_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    driverId: uuid("driver_id")
      .notNull()
      .references(() => driverProfiles.userId, { onDelete: "restrict" }),
    status: confirmedRideStatusEnum("status").notNull().default("ACCEPTED"),
    originLat: numeric("origin_lat", { precision: 9, scale: 6 }).notNull(),
    originLng: numeric("origin_lng", { precision: 9, scale: 6 }).notNull(),
    originAddress: text("origin_address").notNull(),
    destinationLat: numeric("destination_lat", { precision: 9, scale: 6 }).notNull(),
    destinationLng: numeric("destination_lng", { precision: 9, scale: 6 }).notNull(),
    destinationAddress: text("destination_address").notNull(),
    acceptedAt: timestamptz("accepted_at").notNull(),
    startedAt: timestamptz("started_at"),
    completedAt: timestamptz("completed_at"),
    cancelledAt: timestamptz("cancelled_at"),
    cancelledByUserId: uuid("cancelled_by_user_id").references(() => users.id, { onDelete: "restrict" }),
    cancellationReason: text("cancellation_reason"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
  },
  t => [
    // 1:1 solicitação confirmada → corrida.
    uniqueIndex("rides_request_unique").on(t.rideRequestId),
    // Despacho/histórico.
    index("rides_status_created_idx").on(t.status, t.createdAt),
    index("rides_passenger_history_idx").on(t.passengerId, t.createdAt),
    // Um motorista tem no máximo uma corrida ativa.
    uniqueIndex("rides_driver_active_unique")
      .on(t.driverId)
      .where(sql`status IN ('ACCEPTED', 'IN_PROGRESS')`),
    // Um passageiro tem no máximo uma corrida ativa.
    uniqueIndex("rides_passenger_active_unique")
      .on(t.passengerId)
      .where(sql`status IN ('ACCEPTED', 'IN_PROGRESS')`),
    // Garante que a corrida pertence ao mesmo passageiro da solicitação.
    foreignKey({
      columns: [t.rideRequestId, t.passengerId],
      foreignColumns: [rideRequests.id, rideRequests.passengerId],
      name: "rides_request_passenger_fk",
    }),
    check("rides_origin_coords_check", sql`origin_lat BETWEEN -90 AND 90 AND origin_lng BETWEEN -180 AND 180`),
    check(
      "rides_destination_coords_check",
      sql`destination_lat BETWEEN -90 AND 90 AND destination_lng BETWEEN -180 AND 180`,
    ),
    check("rides_origin_address_not_blank", sql`length(trim(origin_address)) > 0`),
    check("rides_destination_address_not_blank", sql`length(trim(destination_address)) > 0`),
    check(
      "rides_accepted_state_check",
      sql`status <> 'ACCEPTED' OR (
        started_at IS NULL AND completed_at IS NULL
        AND cancelled_at IS NULL AND cancelled_by_user_id IS NULL
      )`,
    ),
    check(
      "rides_in_progress_state_check",
      sql`status <> 'IN_PROGRESS' OR (
        started_at IS NOT NULL AND completed_at IS NULL
        AND cancelled_at IS NULL AND cancelled_by_user_id IS NULL
      )`,
    ),
    check(
      "rides_completed_state_check",
      sql`status <> 'COMPLETED' OR (
        started_at IS NOT NULL AND completed_at IS NOT NULL
        AND cancelled_at IS NULL AND cancelled_by_user_id IS NULL
      )`,
    ),
    // CANCELLED preserva accepted_at/started_at quando o cancelamento ocorre
    // depois dessas etapas; completed_at nunca coexiste com cancelamento.
    check(
      "rides_cancelled_state_check",
      sql`status <> 'CANCELLED' OR (
        cancelled_at IS NOT NULL AND cancelled_by_user_id IS NOT NULL AND completed_at IS NULL
      )`,
    ),
    check("rides_cancelled_by_state_check", sql`cancelled_by_user_id IS NULL OR status = 'CANCELLED'`),
    check(
      "rides_chronology_check",
      sql`(started_at IS NULL OR started_at >= accepted_at)
        AND (completed_at IS NULL OR (started_at IS NOT NULL AND completed_at >= started_at))`,
    ),
    check(
      "rides_cancelled_chronology_check",
      sql`cancelled_at IS NULL
        OR (cancelled_at >= accepted_at
          AND (started_at IS NULL OR cancelled_at >= started_at))`,
    ),
  ],
);

export type RideRow = typeof rides.$inferSelect;
export type NewRide = typeof rides.$inferInsert;

// ---------------------------------------------------------------------------
// ride_offers — oferta de uma SOLICITAÇÃO a um motorista elegível.
// Histórico permanente: rejeitadas, expiradas e canceladas permanecem.
// ---------------------------------------------------------------------------
export const rideOffers = pgTable(
  "ride_offers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    rideRequestId: uuid("ride_request_id")
      .notNull()
      .references(() => rideRequests.id, { onDelete: "restrict" }),
    driverUserId: uuid("driver_user_id")
      .notNull()
      .references(() => driverProfiles.userId, { onDelete: "restrict" }),
    status: rideOfferStatusEnum("status").notNull().default("PENDING"),
    offeredAt: timestamptz("offered_at").defaultNow().notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    respondedAt: timestamptz("responded_at"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
  },
  t => [
    uniqueIndex("ride_offers_pending_unique")
      .on(t.rideRequestId, t.driverUserId)
      .where(sql`status = 'PENDING'`),
    uniqueIndex("ride_offers_accepted_unique")
      .on(t.rideRequestId)
      .where(sql`status = 'ACCEPTED'`),
    index("ride_offers_driver_pending_idx")
      .on(t.driverUserId)
      .where(sql`status = 'PENDING'`),
    index("ride_offers_request_idx").on(t.rideRequestId),
    index("ride_offers_expiry_idx")
      .on(t.expiresAt)
      .where(sql`status = 'PENDING'`),
    check("ride_offers_window_check", sql`expires_at > offered_at`),
    check("ride_offers_response_check", sql`((status IN ('ACCEPTED', 'REJECTED')) = (responded_at IS NOT NULL))`),
  ],
);

export type RideOfferRow = typeof rideOffers.$inferSelect;
export type NewRideOffer = typeof rideOffers.$inferInsert;
