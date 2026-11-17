import { relations } from "drizzle-orm";
import { users, userRoles, driverProfiles, driverDocuments, sessions, rideRequests, rides, rideOffers } from "./schema";

/**
 * Relações Drizzle entre as tabelas.
 *
 *  - users 1:N user_roles
 *  - users 1:0..1 driver_profiles
 *  - users 1:N sessions
 *  - driver_profiles 1:N driver_documents
 *  - users 1:N ride_requests (passageiro) e 1:N cancelamentos
 *  - ride_requests 1:N ride_offers
 *  - ride_requests 1:0..1 rides (corrida confirmada)
 *  - rides 1:N? não: uma corrida pertence a um motorista e a um passageiro
 *  - driver_profiles 1:N rides (corridas confirmadas)
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
  rideRequests: many(rideRequests, { relationName: "passengerRideRequests" }),
  cancelledRideRequests: many(rideRequests, { relationName: "cancelledRideRequests" }),
  confirmedRides: many(rides, { relationName: "passengerConfirmedRides" }),
  cancelledRides: many(rides, { relationName: "cancelledConfirmedRides" }),
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
  rides: many(rides, { relationName: "driverConfirmedRides" }),
  rideOffers: many(rideOffers, { relationName: "driverRideOffers" }),
}));

export const driverDocumentsRelations = relations(driverDocuments, ({ one }) => ({
  driver: one(driverProfiles, { fields: [driverDocuments.driverUserId], references: [driverProfiles.userId] }),
  reviewer: one(users, { fields: [driverDocuments.reviewedByUserId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const rideRequestsRelations = relations(rideRequests, ({ one, many }) => ({
  passenger: one(users, {
    fields: [rideRequests.passengerId],
    references: [users.id],
    relationName: "passengerRideRequests",
  }),
  cancelledByUser: one(users, {
    fields: [rideRequests.cancelledByUserId],
    references: [users.id],
    relationName: "cancelledRideRequests",
  }),
  offers: many(rideOffers),
  ride: one(rides, { fields: [rideRequests.id], references: [rides.rideRequestId] }),
}));

export const ridesRelations = relations(rides, ({ one }) => ({
  request: one(rideRequests, { fields: [rides.rideRequestId], references: [rideRequests.id] }),
  passenger: one(users, {
    fields: [rides.passengerId],
    references: [users.id],
    relationName: "passengerConfirmedRides",
  }),
  driver: one(driverProfiles, {
    fields: [rides.driverId],
    references: [driverProfiles.userId],
    relationName: "driverConfirmedRides",
  }),
  cancelledByUser: one(users, {
    fields: [rides.cancelledByUserId],
    references: [users.id],
    relationName: "cancelledConfirmedRides",
  }),
}));

export const rideOffersRelations = relations(rideOffers, ({ one }) => ({
  request: one(rideRequests, { fields: [rideOffers.rideRequestId], references: [rideRequests.id] }),
  driver: one(driverProfiles, {
    fields: [rideOffers.driverUserId],
    references: [driverProfiles.userId],
    relationName: "driverRideOffers",
  }),
}));
