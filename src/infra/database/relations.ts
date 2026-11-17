import { relations } from "drizzle-orm";
import {
  users,
  userRoles,
  driverProfiles,
  driverDocuments,
  sessions,
  rides,
  rideOffers,
} from "./schema";

/**
 * Relações Drizzle entre as tabelas.
 *
 *  - users 1:N user_roles      (uma conta pode ter vários papéis)
 *  - users 1:0..1 driver_profiles
 *  - users 1:N sessions
 *  - driver_profiles 1:N driver_documents
 *  - reviewedByUserId / reviewedByUserId: referências de revisão (opcionais)
 *  - users 1:N rides           (passageiro) e 1:N cancelamentos (autor)
 *  - driver_profiles 1:N rides (motorista atribuído)
 *  - rides 1:N ride_offers     (despacho híbrido)
 *  - driver_profiles 1:N ride_offers (motorista destinatário da oferta)
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
  // Duas referências de users para rides exigem relationName distintos.
  passengerRides: many(rides, { relationName: "passengerRides" }),
  cancelledRides: many(rides, { relationName: "cancelledRides" }),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, { fields: [userRoles.userId], references: [users.id] }),
}));

export const driverProfilesRelations = relations(driverProfiles, ({ one, many }) => ({
  user: one(users, { fields: [driverProfiles.userId], references: [users.id], relationName: "userDriverProfile" }),
  reviewer: one(users, {
    fields: [driverProfiles.reviewedByUserId],
    references: [users.id],
    relationName: "reviewerDriverProfiles",
  }),
  documents: many(driverDocuments),
  // Corridas atribuídas e ofertas recebidas deste motorista.
  rides: many(rides, { relationName: "driverRides" }),
  rideOffers: many(rideOffers, { relationName: "driverRideOffers" }),
}));

export const driverDocumentsRelations = relations(driverDocuments, ({ one }) => ({
  driver: one(driverProfiles, { fields: [driverDocuments.driverUserId], references: [driverProfiles.userId] }),
  reviewer: one(users, { fields: [driverDocuments.reviewedByUserId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const ridesRelations = relations(rides, ({ one, many }) => ({
  passenger: one(users, {
    fields: [rides.passengerId],
    references: [users.id],
    relationName: "passengerRides",
  }),
  driver: one(driverProfiles, {
    fields: [rides.driverId],
    references: [driverProfiles.userId],
    relationName: "driverRides",
  }),
  offers: many(rideOffers),
  cancelledByUser: one(users, {
    fields: [rides.cancelledByUserId],
    references: [users.id],
    relationName: "cancelledRides",
  }),
}));

export const rideOffersRelations = relations(rideOffers, ({ one }) => ({
  ride: one(rides, { fields: [rideOffers.rideId], references: [rides.id] }),
  driver: one(driverProfiles, {
    fields: [rideOffers.driverUserId],
    references: [driverProfiles.userId],
    relationName: "driverRideOffers",
  }),
}));
