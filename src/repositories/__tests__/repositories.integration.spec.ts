import { describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { AccountStatus, AuthRole } from "@/domain/identity/identity.types";
import { DriverStatus } from "@/domain/driver/driver.types";

/**
 * Testes de integração com PostgreSQL real.
 * Só são executados quando TEST_DATABASE_URL estiver definida E as migrations
 * da baseline tiverem sido aplicadas nesse banco. Caso contrário, o bloco é
 * ignorado (skipIf) e nenhuma conexão é aberta.
 *
 * Execução futura: TEST_DATABASE_URL=... bun test
 */
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!testDatabaseUrl)("Repositories — integração PostgreSQL", () => {
  it("cria conta CLIENT em transação e detecta e-mail duplicado pela constraint", async () => {
    if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL ausente");
    process.env.DATABASE_URL = testDatabaseUrl;

    const { userRepository } = await import("@/repositories");
    const { toUniqueViolationError } = await import("@/repositories/database-errors");
    const { db } = await import("@/infra/database/drizzle");
    const { users } = await import("@/infra/database/schema");
    const { eq } = await import("drizzle-orm");

    const email = `integration-client-${Date.now()}@test.local`;
    const created = await userRepository.createClientAccount({
      fullName: "Cliente Integração",
      email,
      passwordHash: "$2b$12$integration.placeholder.hash.value.for.tests.only",
      cpf: "52998224725",
    });

    try {
      const found = await userRepository.findByEmail(email);
      expect(found?.id).toBe(created.id);

      const roles = await userRepository.findRolesByUserId(created.id);
      expect(roles).toEqual([AuthRole.Client]);

      const duplicate = await userRepository
        .createClientAccount({
          fullName: "Duplicado",
          email,
          passwordHash: "$2b$12$integration.placeholder.hash.value.for.tests.only",
        })
        .then(
          () => null,
          (error: unknown) => error,
        );

      expect(toUniqueViolationError(duplicate)?.constraintName).toBe("users_email_lower_unique");
    } finally {
      await db.delete(users).where(eq(users.id, created.id));
    }
  });

  it("cria motorista PENDING com papel DRIVER e driver_profiles", async () => {
    if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL ausente");
    process.env.DATABASE_URL = testDatabaseUrl;

    const { driverRepository, userRepository } = await import("@/repositories");
    const { db } = await import("@/infra/database/drizzle");
    const { users } = await import("@/infra/database/schema");
    const { eq } = await import("drizzle-orm");

    const email = `integration-driver-${Date.now()}@test.local`;
    const created = await driverRepository.createDriverAccount({
      fullName: "Motorista Integração",
      email,
      passwordHash: "$2b$12$integration.placeholder.hash.value.for.tests.only",
      phone: "92999990000",
      cpf: "11144477735",
    });

    try {
      expect(created.driverStatus).toBe(DriverStatus.PENDING);
      expect(created.accountStatus).toBe(AccountStatus.ACTIVE);

      expect(await driverRepository.findStatusByUserId(created.id)).toBe(DriverStatus.PENDING);

      const profile = await driverRepository.findProfileByUserId(created.id);
      expect(profile?.driverStatus).toBe(DriverStatus.PENDING);
      expect(profile?.accountStatus).toBe(AccountStatus.ACTIVE);

      const roles = await userRepository.findRolesByUserId(created.id);
      expect(roles).toEqual([AuthRole.Driver]);
    } finally {
      await db.delete(users).where(eq(users.id, created.id));
    }
  });

  it("rotação de refresh token é compare-and-swap e revogação é idempotente", async () => {
    if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL ausente");
    process.env.DATABASE_URL = testDatabaseUrl;

    const { sessionRepository, userRepository } = await import("@/repositories");
    const { db } = await import("@/infra/database/drizzle");
    const { users } = await import("@/infra/database/schema");
    const { eq } = await import("drizzle-orm");

    const email = `integration-session-${Date.now()}@test.local`;
    const user = await userRepository.createClientAccount({
      fullName: "Sessão Integração",
      email,
      passwordHash: "$2b$12$integration.placeholder.hash.value.for.tests.only",
    });

    try {
      const sessionId = randomUUID();
      const oldHash = "a".repeat(64);
      const newHash = "b".repeat(64);

      await sessionRepository.create({ id: sessionId, userId: user.id, refreshTokenHash: oldHash, ttlSeconds: 60 });

      expect(await sessionRepository.findActiveById(sessionId)).toEqual({ id: sessionId, userId: user.id });

      // Hash esperado incorreto não rotaciona.
      expect(
        await sessionRepository.rotateRefreshToken({
          sessionId,
          expectedRefreshTokenHash: "c".repeat(64),
          newRefreshTokenHash: newHash,
          ttlSeconds: 120,
        }),
      ).toBe(false);

      // Hash correto rotaciona.
      expect(
        await sessionRepository.rotateRefreshToken({
          sessionId,
          expectedRefreshTokenHash: oldHash,
          newRefreshTokenHash: newHash,
          ttlSeconds: 120,
        }),
      ).toBe(true);

      // Reconsumo do hash antigo falha (CAS) — jamais duas rotações.
      expect(
        await sessionRepository.rotateRefreshToken({
          sessionId,
          expectedRefreshTokenHash: oldHash,
          newRefreshTokenHash: "d".repeat(64),
          ttlSeconds: 120,
        }),
      ).toBe(false);

      // Revogação idempotente e efeito imediato na validação.
      expect(await sessionRepository.revoke(sessionId, user.id)).toBe(true);
      expect(await sessionRepository.revoke(sessionId, user.id)).toBe(false);
      expect(await sessionRepository.findActiveById(sessionId)).toBeNull();

      // Revogar sessão de outro usuário não afeta a sessão.
      expect(await sessionRepository.revoke(sessionId, randomUUID())).toBe(false);
    } finally {
      await db.delete(users).where(eq(users.id, user.id));
    }
  });

  it("usa o relógio do PostgreSQL para expiração e atualiza updated_at", async () => {
    if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL ausente");
    process.env.DATABASE_URL = testDatabaseUrl;

    const { sessionRepository, userRepository } = await import("@/repositories");
    const { db } = await import("@/infra/database/drizzle");
    const { sessions, users } = await import("@/infra/database/schema");
    const { eq, sql } = await import("drizzle-orm");

    const email = `integration-session-clock-${Date.now()}@test.local`;
    const user = await userRepository.createClientAccount({
      fullName: "Sessão Relógio",
      email,
      passwordHash: "$2b$12$integration.placeholder.hash.value.for.tests.only",
    });

    try {
      const expiredId = randomUUID();
      await sessionRepository.create({
        id: expiredId,
        userId: user.id,
        refreshTokenHash: "e".repeat(64),
        ttlSeconds: -1,
      });

      expect(await sessionRepository.findActiveById(expiredId)).toBeNull();
      expect((await sessionRepository.findById(expiredId))?.isExpired).toBe(true);

      const sessionId = randomUUID();
      const oldHash = "a".repeat(64);
      await sessionRepository.create({ id: sessionId, userId: user.id, refreshTokenHash: oldHash, ttlSeconds: 60 });

      // Controla o relógio da linha para não depender da resolução de now().
      await db
        .update(sessions)
        .set({ createdAt: sql`now() - interval '1 hour'`, updatedAt: sql`now() - interval '1 hour'` })
        .where(eq(sessions.id, sessionId));

      expect(
        await sessionRepository.rotateRefreshToken({
          sessionId,
          expectedRefreshTokenHash: oldHash,
          newRefreshTokenHash: "b".repeat(64),
          ttlSeconds: 120,
        }),
      ).toBe(true);

      const [afterRotate] = await db
        .select({ createdAt: sessions.createdAt, updatedAt: sessions.updatedAt, expiresAt: sessions.expiresAt })
        .from(sessions)
        .where(eq(sessions.id, sessionId));

      expect(afterRotate.updatedAt.getTime()).toBeGreaterThan(afterRotate.createdAt.getTime());
      expect(afterRotate.expiresAt.getTime()).toBeGreaterThan(afterRotate.updatedAt.getTime());

      await db
        .update(sessions)
        .set({ updatedAt: sql`now() - interval '1 hour'` })
        .where(eq(sessions.id, sessionId));

      expect(await sessionRepository.revoke(sessionId, user.id)).toBe(true);

      const [afterRevoke] = await db
        .select({ createdAt: sessions.createdAt, updatedAt: sessions.updatedAt, revokedAt: sessions.revokedAt })
        .from(sessions)
        .where(eq(sessions.id, sessionId));

      expect(afterRevoke.revokedAt).not.toBeNull();
      expect(afterRevoke.updatedAt.getTime()).toBeGreaterThan(afterRevoke.createdAt.getTime());
      expect(await sessionRepository.findActiveById(sessionId)).toBeNull();
    } finally {
      await db.delete(users).where(eq(users.id, user.id));
    }
  });

  it("aplica DRIVER a uma identidade CLIENT atomicamente e serializa concorrência", async () => {
    if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL ausente");
    process.env.DATABASE_URL = testDatabaseUrl;

    const { driverRepository, userRepository } = await import("@/repositories");
    const { db } = await import("@/infra/database/drizzle");
    const { users } = await import("@/infra/database/schema");
    const { eq } = await import("drizzle-orm");

    const email = `integration-apply-driver-${Date.now()}@test.local`;
    const user = await userRepository.createClientAccount({
      fullName: "Cliente que vira motorista",
      email,
      passwordHash: "$2b$12$integration.placeholder.hash.value.for.tests.only",
      phone: "9233334444",
      cpf: "12345678909",
    });

    try {
      const results = await Promise.all([
        driverRepository.applyDriverRole({ userId: user.id, phone: "9233334444", cpf: "12345678909" }),
        driverRepository.applyDriverRole({ userId: user.id, phone: "9233334444", cpf: "12345678909" }),
      ]);

      expect(results.filter(result => result.status === "created")).toHaveLength(1);
      expect(results.filter(result => result.status === "already_driver")).toHaveLength(1);

      expect(await userRepository.findRolesByUserId(user.id)).toEqual([AuthRole.Client, AuthRole.Driver]);

      const profile = await driverRepository.findProfileByUserId(user.id);
      expect(profile?.driverStatus).toBe(DriverStatus.PENDING);
      expect(profile?.accountStatus).toBe(AccountStatus.ACTIVE);

      const conflict = await driverRepository.applyDriverRole({
        userId: user.id,
        phone: "9233334444",
        cpf: "12345678909",
      });
      expect(conflict).toEqual({ status: "already_driver" });
    } finally {
      await db.delete(users).where(eq(users.id, user.id));
    }
  });

  it("não expõe papéis ou status de usuário logicamente excluído", async () => {
    if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL ausente");
    process.env.DATABASE_URL = testDatabaseUrl;

    const { driverRepository, userRepository } = await import("@/repositories");
    const { db } = await import("@/infra/database/drizzle");
    const { users } = await import("@/infra/database/schema");
    const { eq, sql } = await import("drizzle-orm");

    const stamp = Date.now();
    const client = await userRepository.createClientAccount({
      fullName: "Cliente Excluído",
      email: `integration-soft-delete-client-${stamp}@test.local`,
      passwordHash: "$2b$12$integration.placeholder.hash.value.for.tests.only",
    });
    const driver = await driverRepository.createDriverAccount({
      fullName: "Motorista Excluído",
      email: `integration-soft-delete-driver-${stamp}@test.local`,
      passwordHash: "$2b$12$integration.placeholder.hash.value.for.tests.only",
      phone: "92999990002",
      cpf: "16899535009",
    });

    try {
      await db
        .update(users)
        .set({ deletedAt: sql`now()` })
        .where(eq(users.id, client.id));
      await db
        .update(users)
        .set({ deletedAt: sql`now()` })
        .where(eq(users.id, driver.id));

      expect(await userRepository.findRolesByUserId(client.id)).toEqual([]);
      expect(await userRepository.findRolesByUserId(driver.id)).toEqual([]);
      expect(await driverRepository.findStatusByUserId(driver.id)).toBeNull();
      expect(await driverRepository.findProfileByUserId(driver.id)).toBeNull();
    } finally {
      await db.delete(users).where(eq(users.id, driver.id));
      await db.delete(users).where(eq(users.id, client.id));
    }
  });
});
