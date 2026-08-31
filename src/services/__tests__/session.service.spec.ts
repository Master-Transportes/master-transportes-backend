import { describe, beforeAll, afterAll, beforeEach, afterEach, expect, it } from "bun:test";
import { eq, like } from "drizzle-orm";
import { sessionStore } from "@/cache";
import { redis, CACHE_KEYS } from "@/infra/cache";
import { db } from "@/infra/database/drizzle";
import { users } from "@/infra/database/schema";

const TEST_PREFIX = `session-test-${Date.now()}`;
let testUserId: string;
let testUserEmail: string;

describe("RedisSessionStore", () => {
  let createdSessionIds: string[] = [];

  afterEach(async () => {
    await Promise.all(createdSessionIds.map(id => sessionStore.revoke(id)));
    createdSessionIds = [];
  });

  beforeAll(async () => {
    testUserEmail = `${TEST_PREFIX}@test.com`;
    const [user] = await db
      .insert(users)
      .values({
        fullName: "Session Test User",
        email: testUserEmail,
        password: "hash",
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
      const result = await sessionStore.create({
        userId: testUserId,
        userType: "CLIENT",
      });
      createdSessionIds.push(result.sessionId);

      expect(result).toHaveProperty("sessionId");
      expect(typeof result.sessionId).toBe("string");

      expect(result).toHaveProperty("refreshToken");
      expect(typeof result.refreshToken).toBe("string");
      expect(result.refreshToken.length).toBe(64);

      const session = await sessionStore.get(result.sessionId);
      expect(session).not.toBeNull();
      expect(session!.userId).toBe(testUserId);
      expect(session!.userType).toBe("CLIENT");
    });

    it("stores session with 30-day TTL and expiry timestamp", async () => {
      const result = await sessionStore.create({
        userId: testUserId,
        userType: "CLIENT",
      });
      createdSessionIds.push(result.sessionId);

      const session = await sessionStore.get(result.sessionId);
      expect(session).not.toBeNull();
      expect(session!.createdAt).toBeDefined();
      expect(session!.expiresAt).toBeDefined();

      const expiresMs = new Date(session!.expiresAt).getTime();
      const createdMs = new Date(session!.createdAt).getTime();
      const diffDays = (expiresMs - createdMs) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeGreaterThanOrEqual(29.9);
      expect(diffDays).toBeLessThanOrEqual(30.1);
    });

    it("adds sessionId to user sessions set", async () => {
      const result = await sessionStore.create({
        userId: testUserId,
        userType: "CLIENT",
      });
      createdSessionIds.push(result.sessionId);

      const sessionIds = await sessionStore.getUserSessionIds(testUserId);
      expect(sessionIds).toContain(result.sessionId);
    });
  });

  describe("get()", () => {
    it("returns null for non-existent session", async () => {
      const session = await sessionStore.get("00000000-0000-0000-0000-000000000000");
      expect(session).toBeNull();
    });

    it("returns session data for existing session", async () => {
      const { sessionId } = await sessionStore.create({
        userId: testUserId,
        userType: "CLIENT",
      });
      createdSessionIds.push(sessionId);

      const session = await sessionStore.get(sessionId);
      expect(session).not.toBeNull();
      expect(session!.id).toBe(sessionId);
      expect(session!.userId).toBe(testUserId);
    });
  });

  describe("rotateRefreshToken()", () => {
    it("returns new refresh token and rotates the old one", async () => {
      const { sessionId, refreshToken } = await sessionStore.create({
        userId: testUserId,
        userType: "CLIENT",
      });
      createdSessionIds.push(sessionId);

      const result = await sessionStore.rotateRefreshToken(sessionId, refreshToken);

      expect(result).not.toBeNull();
      expect(typeof result).toBe("string");
      expect(result).not.toBe(refreshToken);
      expect(result!.length).toBe(64);

      const session = await sessionStore.get(sessionId);
      expect(session).not.toBeNull();
    });

    it("returns null for non-existent session", async () => {
      const result = await sessionStore.rotateRefreshToken("00000000-0000-0000-0000-000000000000", "a".repeat(64));
      expect(result).toBeNull();
    });

    it("returns null and revokes all sessions for wrong refresh token", async () => {
      const { sessionId } = await sessionStore.create({
        userId: testUserId,
        userType: "CLIENT",
      });
      createdSessionIds.push(sessionId);

      const result = await sessionStore.rotateRefreshToken(sessionId, "a".repeat(64));
      expect(result).toBeNull();

      const session = await sessionStore.get(sessionId);
      expect(session).toBeNull();
    });

    it("returns null for revoked session", async () => {
      const { sessionId, refreshToken } = await sessionStore.create({
        userId: testUserId,
        userType: "CLIENT",
      });
      createdSessionIds.push(sessionId);

      await sessionStore.revoke(sessionId);

      const result = await sessionStore.rotateRefreshToken(sessionId, refreshToken);
      expect(result).toBeNull();
    });
  });

  describe("revoke()", () => {
    it("revokes session so get() returns null", async () => {
      const { sessionId } = await sessionStore.create({
        userId: testUserId,
        userType: "CLIENT",
      });
      createdSessionIds.push(sessionId);

      await sessionStore.revoke(sessionId);

      const session = await sessionStore.get(sessionId);
      expect(session).toBeNull();
    });
  });

  describe("revokeAll()", () => {
    it("revokes all sessions for the user and clears session set", async () => {
      const s1 = await sessionStore.create({ userId: testUserId, userType: "CLIENT" });
      createdSessionIds.push(s1.sessionId);
      const s2 = await sessionStore.create({ userId: testUserId, userType: "CLIENT" });
      createdSessionIds.push(s2.sessionId);
      const s3 = await sessionStore.create({ userId: testUserId, userType: "CLIENT" });
      createdSessionIds.push(s3.sessionId);

      await sessionStore.revokeAll(testUserId);

      const s1data = await sessionStore.get(s1.sessionId);
      const s2data = await sessionStore.get(s2.sessionId);
      const s3data = await sessionStore.get(s3.sessionId);
      expect(s1data).toBeNull();
      expect(s2data).toBeNull();
      expect(s3data).toBeNull();

      const sessionIds = await sessionStore.getUserSessionIds(testUserId);
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

      const count = await sessionStore.count(user.id);
      expect(count).toBe(0);

      await db.delete(users).where(eq(users.id, user.id));
    });

    it("returns correct count after creating sessions", async () => {
      const c1 = await sessionStore.create({ userId: testUserId, userType: "CLIENT" });
      createdSessionIds.push(c1.sessionId);
      const c2 = await sessionStore.create({ userId: testUserId, userType: "CLIENT" });
      createdSessionIds.push(c2.sessionId);

      const count = await sessionStore.count(testUserId);
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
          role: "CLIENT",
        })
        .returning({ id: users.id });

      const ids = await sessionStore.getUserSessionIds(user.id);
      expect(ids).toEqual([]);

      await db.delete(users).where(eq(users.id, user.id));
    });

    it("returns all session IDs for the user", async () => {
      const s1 = await sessionStore.create({ userId: testUserId, userType: "CLIENT" });
      createdSessionIds.push(s1.sessionId);
      const s2 = await sessionStore.create({ userId: testUserId, userType: "CLIENT" });
      createdSessionIds.push(s2.sessionId);

      const ids = await sessionStore.getUserSessionIds(testUserId);
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
          role: "CLIENT",
        })
        .returning({ id: users.id });

      await sessionStore.revokeAll(user.id);
      const ids = await sessionStore.getUserSessionIds(user.id);
      expect(ids).toEqual([]);

      await db.delete(users).where(eq(users.id, user.id));
    });
  });
});
