import { describe, beforeAll, afterAll, afterEach, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { sessionStore } from "@/cache";
import { redis, CACHE_KEYS } from "@/infra/cache";
import { db } from "@/infra/database/drizzle";
import { users } from "@/infra/database/schema";

const TEST_PREFIX = `session-${Date.now()}`;
const TEST_CPF = "12345678901";

const createdUserIds: string[] = [];
const createdEmails: string[] = [];
const createdSessionIds: string[] = [];

function trackSession(id: string) {
  createdSessionIds.push(id);
}

describe("RedisSessionStore", () => {
  const mainEmail = `${TEST_PREFIX}@test.com`;
  let mainUserId: string;

  beforeAll(async () => {
    const [user] = await db
      .insert(users)
      .values({
        fullName: "Session Test User",
        email: mainEmail,
        cpf: TEST_CPF,
        password: "hash",
        role: "CLIENT",
      })
      .returning({ id: users.id });
    mainUserId = user.id;
    trackUser(user.id, mainEmail);
  });

  afterAll(async () => {
    await Promise.all(createdSessionIds.map(id => sessionStore.revoke(id).catch(() => {})));

    const pipeline = redis.pipeline();
    createdUserIds.forEach(userId => {
      pipeline.del(CACHE_KEYS.CLIENT_SESSIONS(userId));
    });
    await pipeline.exec();

    await Promise.all(createdEmails.map(email => db.delete(users).where(eq(users.email, email))));
  });

  afterEach(async () => {
    createdSessionIds.length = 0;
  });

  function trackUser(id: string, email: string) {
    createdUserIds.push(id);
    createdEmails.push(email);
  }

  describe("create()", () => {
    it("creates a session and returns sessionId + refreshToken", async () => {
      const result = await sessionStore.create({
        userId: mainUserId,
        userType: "CLIENT",
      });
      trackSession(result.sessionId);

      expect(result).toHaveProperty("sessionId");
      expect(typeof result.sessionId).toBe("string");

      expect(result).toHaveProperty("refreshToken");
      expect(typeof result.refreshToken).toBe("string");
      expect(result.refreshToken.length).toBe(64);

      const session = await sessionStore.get(result.sessionId);
      expect(session).not.toBeNull();
      expect(session!.userId).toBe(mainUserId);
      expect(session!.userType).toBe("CLIENT");
    });

    it("stores session with 30-day TTL and expiry timestamp", async () => {
      const result = await sessionStore.create({
        userId: mainUserId,
        userType: "CLIENT",
      });
      trackSession(result.sessionId);

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
        userId: mainUserId,
        userType: "CLIENT",
      });
      trackSession(result.sessionId);

      const sessionIds = await sessionStore.getUserSessionIds(mainUserId);
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
        userId: mainUserId,
        userType: "CLIENT",
      });
      trackSession(sessionId);

      const session = await sessionStore.get(sessionId);
      expect(session).not.toBeNull();
      expect(session!.id).toBe(sessionId);
      expect(session!.userId).toBe(mainUserId);
    });
  });

  describe("rotateRefreshToken()", () => {
    it("returns new refresh token and rotates the old one", async () => {
      const { sessionId, refreshToken } = await sessionStore.create({
        userId: mainUserId,
        userType: "CLIENT",
      });
      trackSession(sessionId);

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
        userId: mainUserId,
        userType: "CLIENT",
      });
      trackSession(sessionId);

      const result = await sessionStore.rotateRefreshToken(sessionId, "a".repeat(64));
      expect(result).toBeNull();

      const session = await sessionStore.get(sessionId);
      expect(session).toBeNull();
    });

    it("returns null for revoked session", async () => {
      const { sessionId, refreshToken } = await sessionStore.create({
        userId: mainUserId,
        userType: "CLIENT",
      });
      trackSession(sessionId);

      await sessionStore.revoke(sessionId);

      const result = await sessionStore.rotateRefreshToken(sessionId, refreshToken);
      expect(result).toBeNull();
    });
  });

  describe("revoke()", () => {
    it("revokes session so get() returns null", async () => {
      const { sessionId } = await sessionStore.create({
        userId: mainUserId,
        userType: "CLIENT",
      });
      trackSession(sessionId);

      await sessionStore.revoke(sessionId);

      const session = await sessionStore.get(sessionId);
      expect(session).toBeNull();
    });
  });

  describe("revokeAll()", () => {
    it("revokes all sessions for the user and clears session set", async () => {
      const s1 = await sessionStore.create({ userId: mainUserId, userType: "CLIENT" });
      trackSession(s1.sessionId);
      const s2 = await sessionStore.create({ userId: mainUserId, userType: "CLIENT" });
      trackSession(s2.sessionId);
      const s3 = await sessionStore.create({ userId: mainUserId, userType: "CLIENT" });
      trackSession(s3.sessionId);

      await sessionStore.revokeAll(mainUserId);

      expect(await sessionStore.get(s1.sessionId)).toBeNull();
      expect(await sessionStore.get(s2.sessionId)).toBeNull();
      expect(await sessionStore.get(s3.sessionId)).toBeNull();

      const sessionIds = await sessionStore.getUserSessionIds(mainUserId);
      expect(sessionIds).toHaveLength(0);
    });
  });

  describe("count()", () => {
    it("returns 0 when user has no sessions", async () => {
      const email = `${TEST_PREFIX}-nocount@test.com`;
      const [user] = await db
        .insert(users)
        .values({
          fullName: "Count Test",
          email,
          cpf: TEST_CPF,
          password: "hash",
          role: "CLIENT",
        })
        .returning({ id: users.id });
      trackUser(user.id, email);

      const count = await sessionStore.count(user.id);
      expect(count).toBe(0);
    });

    it("returns correct count after creating sessions", async () => {
      const c1 = await sessionStore.create({ userId: mainUserId, userType: "CLIENT" });
      trackSession(c1.sessionId);
      const c2 = await sessionStore.create({ userId: mainUserId, userType: "CLIENT" });
      trackSession(c2.sessionId);

      const count = await sessionStore.count(mainUserId);
      expect(count).toBeGreaterThanOrEqual(2);
    });
  });

  describe("getUserSessionIds()", () => {
    it("returns empty array for user with no sessions", async () => {
      const email = `${TEST_PREFIX}-nosessions@test.com`;
      const [user] = await db
        .insert(users)
        .values({
          fullName: "No Sessions",
          email,
          cpf: TEST_CPF,
          password: "hash",
          role: "CLIENT",
        })
        .returning({ id: users.id });
      trackUser(user.id, email);

      const ids = await sessionStore.getUserSessionIds(user.id);
      expect(ids).toEqual([]);
    });

    it("returns all session IDs for the user", async () => {
      const s1 = await sessionStore.create({ userId: mainUserId, userType: "CLIENT" });
      trackSession(s1.sessionId);
      const s2 = await sessionStore.create({ userId: mainUserId, userType: "CLIENT" });
      trackSession(s2.sessionId);

      const ids = await sessionStore.getUserSessionIds(mainUserId);
      expect(ids).toContain(s1.sessionId);
      expect(ids).toContain(s2.sessionId);
    });
  });

  describe("revokeAll() edge cases", () => {
    it("does nothing when user has no sessions", async () => {
      const email = `${TEST_PREFIX}-norevoke@test.com`;
      const [user] = await db
        .insert(users)
        .values({
          fullName: "No Revoke Test",
          email,
          cpf: TEST_CPF,
          password: "hash",
          role: "CLIENT",
        })
        .returning({ id: users.id });
      trackUser(user.id, email);

      await sessionStore.revokeAll(user.id);
      const ids = await sessionStore.getUserSessionIds(user.id);
      expect(ids).toEqual([]);
    });
  });
});
