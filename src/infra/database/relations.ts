import { relations } from "drizzle-orm";
import { users, userRoles, driverProfiles, driverDocuments, sessions } from "./schema";

/**
 * Relações Drizzle entre as cinco tabelas.
 *
 *  - users 1:N user_roles      (uma conta pode ter vários papéis)
 *  - users 1:0..1 driver_profiles
 *  - users 1:N sessions
 *  - driver_profiles 1:N driver_documents
 *  - reviewedByUserId / reviewedByUserId: referências de revisão (opcionais)
 */
export const usersRelations = relations(users, ({ many, one }) => ({
  roles: many(userRoles),
  sessions: many(sessions),
  driverProfile: one(driverProfiles, {
    fields: [users.id],
    references: [driverProfiles.userId],
    relationName: "userDriverProfile",
  }),
  reviewedDriverProfiles: many(driverProfiles, { relationName: "reviewerDriverProfiles" }),
  reviewedDocuments: many(driverDocuments),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, {
    fields: [userRoles.userId],
    references: [users.id],
  }),
}));

export const driverProfilesRelations = relations(driverProfiles, ({ one, many }) => ({
  user: one(users, {
    fields: [driverProfiles.userId],
    references: [users.id],
    relationName: "userDriverProfile",
  }),
  reviewer: one(users, {
    fields: [driverProfiles.reviewedByUserId],
    references: [users.id],
    relationName: "reviewerDriverProfiles",
  }),
  documents: many(driverDocuments),
}));

export const driverDocumentsRelations = relations(driverDocuments, ({ one }) => ({
  driver: one(driverProfiles, {
    fields: [driverDocuments.driverUserId],
    references: [driverProfiles.userId],
  }),
  reviewer: one(users, {
    fields: [driverDocuments.reviewedByUserId],
    references: [users.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));
