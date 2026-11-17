import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import type { NewRide } from "@/infra/database/schema";

/**
 * Constraints do novo modelo:
 *  - ride_requests: uma solicitação aberta por passageiro e estados coerentes;
 *  - rides: somente corridas confirmadas, estados e cronologia;
 *  - ride_offers: ofertas vinculadas à solicitação, sem duplicidade indevida.
 */
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!testDatabaseUrl)("ride_requests/rides/ride_offers — constraints (integração)", () => {
  let db: typeof import("@/infra/database/drizzle").db;
  let rideRequests: typeof import("@/infra/database/schema").rideRequests;
  let rideOffers: typeof import("@/infra/database/schema").rideOffers;
  let rides: typeof import("@/infra/database/schema").rides;
  let userRepository: typeof import("@/repositories").userRepository;
  let driverRepository: typeof import("@/repositories").driverRepository;
  let users: typeof import("@/infra/database/schema").users;
  let eq: typeof import("drizzle-orm").eq;
  let sql: typeof import("drizzle-orm").sql;

  let passengerId = "";
  let otherPassengerId = "";
  let passengerUserId = "";
  let otherPassengerUserId = "";
  let driver1Id = "";
  let driver2Id = "";
  let driver1UserId = "";
  let driver2UserId = "";

  const baseValues = (rideRequestId: string, overrides: Partial<NewRide> = {}): NewRide => ({
    rideRequestId,
    passengerId,
    driverId: driver1Id,
    status: "ACCEPTED",
    originLat: "0.000000",
    originLng: "0.000000",
    originAddress: "Origem",
    destinationLat: "1.000000",
    destinationLng: "1.000000",
    destinationAddress: "Destino",
    acceptedAt: new Date("2026-01-01T10:00:00.000Z"),
    ...overrides,
  });

  async function createRequest(overrides: Partial<typeof rideRequests.$inferInsert> = {}) {
    const [row] = await db
      .insert(rideRequests)
      .values({
        passengerId,
        status: "SEARCHING",
        originLat: "0.000000",
        originLng: "0.000000",
        originAddress: "Origem",
        destinationLat: "1.000000",
        destinationLng: "1.000000",
        destinationAddress: "Destino",
        searchExpiresAt: sql`now() + interval '5 minutes'`,
        ...overrides,
      })
      .returning();

    return row;
  }

  async function expectRideFailure(values: NewRide): Promise<void> {
    let error: unknown = null;
    try {
      await db.insert(rides).values(values);
    } catch (caught) {
      error = caught;
    }
    expect(error).not.toBeNull();
  }

  async function insertOffer(values: {
    rideRequestId: string;
    driverUserId: string;
    status?: "PENDING" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "CANCELLED";
    offeredAt?: Date;
    expiresAt: Date;
    respondedAt?: Date | null;
  }): Promise<string> {
    const [row] = await db
      .insert(rideOffers)
      .values({
        rideRequestId: values.rideRequestId,
        driverUserId: values.driverUserId,
        status: values.status ?? "PENDING",
        offeredAt: values.offeredAt,
        expiresAt: values.expiresAt,
        respondedAt: values.respondedAt ?? null,
      })
      .returning({ id: rideOffers.id });
    return row.id;
  }

  async function expectOfferFailure(values: Parameters<typeof insertOffer>[0]): Promise<void> {
    let error: unknown = null;
    try {
      await insertOffer(values);
    } catch (caught) {
      error = caught;
    }
    expect(error).not.toBeNull();
  }

  beforeAll(async () => {
    if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL ausente");
    process.env.DATABASE_URL = testDatabaseUrl;

    ({ db } = await import("@/infra/database/drizzle"));
    ({ rideRequests, rideOffers, rides, users } = await import("@/infra/database/schema"));
    ({ userRepository, driverRepository } = await import("@/repositories"));
    ({ eq, sql } = await import("drizzle-orm"));

    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const passwordHash = "$2b$12$integration.placeholder.hash.value.for.tests.only";

    const passenger = await userRepository.createClientAccount({
      fullName: "Passageiro Constraints",
      email: `request-constraints-passenger-${stamp}@test.local`,
      passwordHash,
    });
    passengerId = passenger.id;
    passengerUserId = passenger.id;

    const otherPassenger = await userRepository.createClientAccount({
      fullName: "Outro Passageiro Constraints",
      email: `request-constraints-other-${stamp}@test.local`,
      passwordHash,
    });
    otherPassengerId = otherPassenger.id;
    otherPassengerUserId = otherPassenger.id;

    const driver1 = await driverRepository.createDriverAccount({
      fullName: "Motorista Constraints 1",
      email: `request-constraints-driver1-${stamp}@test.local`,
      passwordHash,
      phone: "92999990050",
      cpf: "39053344705",
    });
    driver1Id = driver1.id;
    driver1UserId = driver1.id;

    const driver2 = await driverRepository.createDriverAccount({
      fullName: "Motorista Constraints 2",
      email: `request-constraints-driver2-${stamp}@test.local`,
      passwordHash,
      phone: "92999990051",
      cpf: "98765432100",
    });
    driver2Id = driver2.id;
    driver2UserId = driver2.id;
  });

  afterEach(async () => {
    if (!db || !passengerId) return;

    for (const userId of [passengerId, otherPassengerId]) {
      await db.delete(rides).where(eq(rides.passengerId, userId));
      await db
        .delete(rideOffers)
        .where(sql`${rideOffers.rideRequestId} IN (SELECT id FROM ride_requests WHERE passenger_id = ${userId})`);
      await db.delete(rideRequests).where(eq(rideRequests.passengerId, userId));
    }
  });

  afterAll(async () => {
    if (!db) return;

    for (const userId of [passengerUserId, otherPassengerUserId, driver1UserId, driver2UserId]) {
      if (userId) await db.delete(users).where(eq(users.id, userId));
    }
  });

  it("exige no máximo uma solicitação aberta/aceita por passageiro", async () => {
    await createRequest();

    let error: unknown = null;
    try {
      await createRequest();
    } catch (caught) {
      error = caught;
    }
    expect(error).not.toBeNull();

    const cancelled = await createRequest({
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelledByUserId: passengerId,
    });
    expect(cancelled.status).toBe("CANCELLED");
  });

  it("valida estado e janela temporal da solicitação", async () => {
    const baseRequest = {
      passengerId,
      status: "SEARCHING" as const,
      originLat: "0",
      originLng: "0",
      originAddress: "Origem",
      destinationLat: "1",
      destinationLng: "1",
      destinationAddress: "Destino",
      searchExpiresAt: sql`now() + interval '5 minutes'`,
    };

    const invalidStatuses = [
      { ...baseRequest, acceptedAt: new Date() },
      { ...baseRequest, status: "ACCEPTED" as const },
      { ...baseRequest, status: "EXPIRED" as const, cancelledAt: new Date() },
      { ...baseRequest, status: "CANCELLED" as const },
    ];

    for (const values of invalidStatuses) {
      let error: unknown = null;
      try {
        await db.insert(rideRequests).values(values);
      } catch (caught) {
        error = caught;
      }
      expect(error).not.toBeNull();
    }
  });

  it("aceita os estados válidos da corrida confirmada e rejeita estados incompletos", async () => {
    const request = await createRequest({ status: "ACCEPTED", acceptedAt: new Date() });
    const acceptedAt = new Date("2026-01-01T10:00:00.000Z");
    const startedAt = new Date("2026-01-01T10:05:00.000Z");
    const completedAt = new Date("2026-01-01T10:30:00.000Z");
    const cancelledAt = new Date("2026-01-01T10:10:00.000Z");

    for (const values of [
      baseValues(request.id, { status: "ACCEPTED", acceptedAt }),
      baseValues(request.id, { status: "IN_PROGRESS", acceptedAt, startedAt }),
      baseValues(request.id, { status: "COMPLETED", acceptedAt, startedAt, completedAt }),
      baseValues(request.id, {
        status: "CANCELLED",
        acceptedAt,
        startedAt,
        cancelledAt,
        cancelledByUserId: passengerId,
      }),
    ]) {
      await db.insert(rides).values(values);
      await db.delete(rides).where(eq(rides.rideRequestId, request.id));
    }

    const invalid = [
      baseValues(request.id, { status: "ACCEPTED", acceptedAt, startedAt }),
      baseValues(request.id, { status: "IN_PROGRESS", acceptedAt }),
      baseValues(request.id, { status: "COMPLETED", acceptedAt, startedAt }),
      baseValues(request.id, {
        status: "CANCELLED",
        acceptedAt,
        startedAt,
        completedAt,
        cancelledAt,
        cancelledByUserId: passengerId,
      }),
      baseValues(request.id, { status: "IN_PROGRESS", acceptedAt, startedAt: new Date("2026-01-01T09:59:00.000Z") }),
    ];

    for (const values of invalid) {
      await expectRideFailure(values);
    }
  });

  it("garante 1:1 solicitação → corrida e o mesmo passageiro da solicitação", async () => {
    const request = await createRequest({ status: "ACCEPTED", acceptedAt: new Date() });
    const otherRequest = await createRequest({
      passengerId: otherPassengerId,
      status: "ACCEPTED",
      acceptedAt: new Date(),
    });

    await db.insert(rides).values(baseValues(request.id));

    await expectRideFailure(baseValues(request.id));
    // A solicitação pertence a outro passageiro; a FK composta rejeita a corrida.
    await expectRideFailure(baseValues(otherRequest.id, { passengerId }));
  });

  it("aplica as invariantes de ride_offers vinculadas à solicitação", async () => {
    const request = await createRequest();
    const offeredAt = new Date("2026-01-01T10:00:00.000Z");
    const expiresAt = new Date("2026-01-01T10:10:00.000Z");
    const respondedAt = new Date("2026-01-01T10:02:00.000Z");

    const pendingId = await insertOffer({ rideRequestId: request.id, driverUserId: driver1Id, offeredAt, expiresAt });
    expect(pendingId).toBeTruthy();

    await expectOfferFailure({ rideRequestId: request.id, driverUserId: driver2Id, offeredAt, expiresAt, respondedAt });
    await expectOfferFailure({
      rideRequestId: request.id,
      driverUserId: driver2Id,
      offeredAt: expiresAt,
      expiresAt: offeredAt,
    });
    await expectOfferFailure({ rideRequestId: request.id, driverUserId: driver1Id, offeredAt, expiresAt });

    await insertOffer({
      rideRequestId: request.id,
      driverUserId: driver1Id,
      status: "ACCEPTED",
      offeredAt,
      expiresAt,
      respondedAt,
    });
    await expectOfferFailure({
      rideRequestId: request.id,
      driverUserId: driver2Id,
      status: "ACCEPTED",
      offeredAt,
      expiresAt,
      respondedAt,
    });
    await expectOfferFailure({
      rideRequestId: request.id,
      driverUserId: driver2Id,
      status: "ACCEPTED",
      offeredAt,
      expiresAt,
    });
    await expectOfferFailure({
      rideRequestId: request.id,
      driverUserId: driver2Id,
      status: "CANCELLED",
      offeredAt,
      expiresAt,
      respondedAt,
    });
  });
});
