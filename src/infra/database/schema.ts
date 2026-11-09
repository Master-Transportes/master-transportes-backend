import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  date,
  timestamp,
  index,
  uniqueIndex,
  primaryKey,
  check,
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
    // E-mail único entre contas ativas, sem distinção de maiúsculas/minúsculas.
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
  t => [
    primaryKey({ columns: [t.userId, t.role], name: "user_roles_pkey" }),
    index("user_roles_role_idx").on(t.role),
  ],
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
    check(
      "driver_documents_dates_check",
      sql`expires_on IS NULL OR issued_on IS NULL OR expires_on >= issued_on`,
    ),
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
