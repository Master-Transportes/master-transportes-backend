import { describe, beforeAll, afterAll, expect, it } from "bun:test";
import { APIError } from "encore.dev/api";
import { hashSync } from "bcrypt";
import { eq, like } from "drizzle-orm";
import { SessionService } from "@/services/session.service";
import { cache } from "@/infra/cache";
import { redis } from "@/infra/cache/redis-client";
import { db } from "@/infra/db/drizzle";
import { users } from "@/infra/db/schema";
import { CACHE_KEYS } from "@/infra/cache/keys-cache";

const TEST_PREFIX = `session-test-${Date.now()}`;
let testUserId: string;
let testUserEmail: string;

const sessionService = new SessionService(cache);

describe("SessionService", () => {
  beforeAll(async () => {
    testUserEmail = `${TEST_PREFIX}@test.com`;
    const [user] = await db
      .insert(users)
      .values({
        fullName: "Session Test User",
        email: testUserEmail,
        password: hashSync("test-password-123", 10),
        role: "CLIENT",
      })
      .returning({ id: users.id });
    testUserId = user.id;
  });

  afterAll(async () => {
    await Promise.all([
      db.delete(users).where(like(users.email, `${TEST_PREFIX}%`)),
      redis.del(CACHE_KEYS.USER_SESSIONS(testUserId)),
    ]);
  });

  describe("create()", () => {
    it("creates a session and returns sessionId + refreshToken", async () => {
      const result = await sessionService.create({
        userId: testUserId,
        role: "CLIENT",
      });

      expect(result).toHaveProperty("sessionId");
      expect(typeof result.sessionId).toBe("string");

      expect(result).toHaveProperty("refreshToken");
      expect(typeof result.refreshToken).toBe("string");
      expect(result.refreshToken.length).toBe(64);

      const session = await sessionService.get(result.sessionId);
      expect(session).not.toBeNull();
      expect(session!.userId).toBe(testUserId);
      expect(session!.role).toBe("CLIENT");
    });

    it("stores session with 7-day TTL and expiry timestamp", async () => {
      const result = await sessionService.create({
        userId: testUserId,
        role: "CLIENT",
      });

      const session = await sessionService.get(result.sessionId);
      expect(session).not.toBeNull();
      expect(session!.createdAt).toBeDefined();
      expect(session!.expiresAt).toBeDefined();

      const expiresMs = new Date(session!.expiresAt).getTime();
      const createdMs = new Date(session!.createdAt).getTime();
      const diffDays = (expiresMs - createdMs) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeGreaterThanOrEqual(6.9);
      expect(diffDays).toBeLessThanOrEqual(7.1);
    });

    it("adds sessionId to user sessions set", async () => {
      const result = await sessionService.create({
        userId: testUserId,
        role: "CLIENT",
      });

      const sessionIds = await sessionService.getUserSessionIds(testUserId);
      expect(sessionIds).toContain(result.sessionId);
    });
  });

  describe("get()", () => {
    it("returns null for non-existent session", async () => {
      const session = await sessionService.get("00000000-0000-0000-0000-000000000000");
      expect(session).toBeNull();
    });

    it("returns session data for existing session", async () => {
      const { sessionId } = await sessionService.create({
        userId: testUserId,
        role: "CLIENT",
      });

      const session = await sessionService.get(sessionId);
      expect(session).not.toBeNull();
      expect(session!.sessionId).toBe(sessionId);
      expect(session!.userId).toBe(testUserId);
    });
  });

  describe("refresh()", () => {
    it("returns new refresh token and rotates the old one", async () => {
      const { sessionId, refreshToken } = await sessionService.create({
        userId: testUserId,
        role: "CLIENT",
      });

      const result = await sessionService.refresh(sessionId, refreshToken);

      expect(result).toHaveProperty("refreshToken");
      expect(result.refreshToken).not.toBe(refreshToken);
      expect(result).toHaveProperty("userId", testUserId);

      const oldHashInSession = await sessionService.get(sessionId);
      expect(oldHashInSession).not.toBeNull();
    });

    it("rejects non-existent session", async () => {
      let error: unknown;
      try {
        await sessionService.refresh("00000000-0000-0000-0000-000000000000", "a".repeat(64));
      } catch (e) {
        error = e;
      }

      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).message).toBe("Sessão não encontrada ou expirada.");
    });

    it("rejects wrong refresh token", async () => {
      const { sessionId } = await sessionService.create({
        userId: testUserId,
        role: "CLIENT",
      });

      let error: unknown;
      try {
        await sessionService.refresh(sessionId, "a".repeat(64));
      } catch (e) {
        error = e;
      }

      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).message).toBe("Refresh token inválido.");
    });

    it("rejects refresh of revoked session", async () => {
      const { sessionId, refreshToken } = await sessionService.create({
        userId: testUserId,
        role: "CLIENT",
      });

      await sessionService.revoke(sessionId);

      let error: unknown;
      try {
        await sessionService.refresh(sessionId, refreshToken);
      } catch (e) {
        error = e;
      }

      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).message).toBe("Sessão não encontrada ou expirada.");
    });
  });

  describe("revoke()", () => {
    it("removes session from cache and user sessions set", async () => {
      const { sessionId } = await sessionService.create({
        userId: testUserId,
        role: "CLIENT",
      });

      await sessionService.revoke(sessionId);

      const session = await sessionService.get(sessionId);
      expect(session).toBeNull();

      const sessionIds = await sessionService.getUserSessionIds(testUserId);
      expect(sessionIds).not.toContain(sessionId);
    });
  });

  describe("revokeAll()", () => {
    it("removes all sessions for the user", async () => {
      const s1 = await sessionService.create({ userId: testUserId, role: "CLIENT" });
      const s2 = await sessionService.create({ userId: testUserId, role: "CLIENT" });
      const s3 = await sessionService.create({ userId: testUserId, role: "CLIENT" });

      await sessionService.revokeAll(testUserId);

      const s1data = await sessionService.get(s1.sessionId);
      const s2data = await sessionService.get(s2.sessionId);
      const s3data = await sessionService.get(s3.sessionId);
      expect(s1data).toBeNull();
      expect(s2data).toBeNull();
      expect(s3data).toBeNull();

      const sessionIds = await sessionService.getUserSessionIds(testUserId);
      expect(sessionIds).toHaveLength(0);
    });
  });

  describe("count()", () => {
    it("returns 0 when user has no sessions", async () => {
      const uniqueEmail = `${TEST_PREFIX}-nocount@test.com`;
      const [user] = await db
        .insert(users)
        .values({
          fullName: "Count Test",
          email: uniqueEmail,
          password: "hash",
          role: "CLIENT",
        })
        .returning({ id: users.id });

      const count = await sessionService.count(user.id);
      expect(count).toBe(0);

      await db.delete(users).where(eq(users.id, user.id));
    });

    it("returns correct count after creating sessions", async () => {
      await sessionService.create({ userId: testUserId, role: "CLIENT" });
      await sessionService.create({ userId: testUserId, role: "CLIENT" });

      const count = await sessionService.count(testUserId);
      expect(count).toBeGreaterThanOrEqual(2);
    });
  });

  describe("getUserSessionIds()", () => {
    it("returns empty array for user with no sessions", async () => {
      const uniqueEmail = `${TEST_PREFIX}-no-sessions@test.com`;
      const [user] = await db
        .insert(users)
        .values({
          fullName: "No Sessions",
          email: uniqueEmail,
          password: "hash",
          role: "DRIVER",
        })
        .returning({ id: users.id });

      const ids = await sessionService.getUserSessionIds(user.id);
      expect(ids).toEqual([]);

      await db.delete(users).where(eq(users.id, user.id));
    });

    it("returns all session IDs for the user", async () => {
      const s1 = await sessionService.create({ userId: testUserId, role: "CLIENT" });
      const s2 = await sessionService.create({ userId: testUserId, role: "CLIENT" });

      const ids = await sessionService.getUserSessionIds(testUserId);
      expect(ids).toContain(s1.sessionId);
      expect(ids).toContain(s2.sessionId);
    });
  });

  describe("revokeAll() edge cases", () => {
    it("does nothing when user has no sessions", async () => {
      const uniqueEmail = `${TEST_PREFIX}-no-revoke@test.com`;
      const [user] = await db
        .insert(users)
        .values({
          fullName: "No Revoke Test",
          email: uniqueEmail,
          password: "hash",
          role: "DRIVER",
        })
        .returning({ id: users.id });

      await sessionService.revokeAll(user.id);
      const ids = await sessionService.getUserSessionIds(user.id);
      expect(ids).toEqual([]);

      await db.delete(users).where(eq(users.id, user.id));
    });
  });


});
