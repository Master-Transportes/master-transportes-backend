import { eq, and, isNull, isNotNull } from "drizzle-orm";
import { sessions } from "@/infra/database/schema";
import type { SessionRow, NewSession } from "@/infra/database/schema";
import { db } from "@/infra/database/drizzle";
import type { ISessionRepository } from "./contracts/ISessionRepository";

const SESSION_COLUMNS = {
  id: sessions.id,
  userId: sessions.userId,
  userType: sessions.userType,
  refreshTokenHash: sessions.refreshTokenHash,
  deviceId: sessions.deviceId,
  userAgent: sessions.userAgent,
  ipAddress: sessions.ipAddress,
  createdAt: sessions.createdAt,
  lastSeenAt: sessions.lastSeenAt,
  expiresAt: sessions.expiresAt,
  revokedAt: sessions.revokedAt,
} as const;

export class SessionRepository implements ISessionRepository {
  async create(data: NewSession): Promise<SessionRow> {
    const [row] = await db.insert(sessions).values(data).returning(SESSION_COLUMNS);
    return row;
  }

  async findById(id: string): Promise<SessionRow | null> {
    const [row] = await db
      .select(SESSION_COLUMNS)
      .from(sessions)
      .where(and(eq(sessions.id, id), isNull(sessions.revokedAt)))
      .limit(1);
    return row ?? null;
  }

  async findByRefreshTokenHash(hash: string): Promise<SessionRow | null> {
    const [row] = await db.select(SESSION_COLUMNS).from(sessions).where(eq(sessions.refreshTokenHash, hash)).limit(1);
    return row ?? null;
  }

  async findActiveByDeviceId(userId: string, deviceId: string): Promise<SessionRow | null> {
    const [row] = await db
      .select(SESSION_COLUMNS)
      .from(sessions)
      .where(and(eq(sessions.userId, userId), eq(sessions.deviceId, deviceId), isNull(sessions.revokedAt)))
      .limit(1);
    return row ?? null;
  }

  async findAllActiveByUserId(userId: string): Promise<SessionRow[]> {
    return db
      .select(SESSION_COLUMNS)
      .from(sessions)
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  }

  async findActiveByUserId(userId: string): Promise<SessionRow | null> {
    const [row] = await db
      .select(SESSION_COLUMNS)
      .from(sessions)
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), isNotNull(sessions.expiresAt)))
      .limit(1);
    return row ?? null;
  }

  async rotateRefreshToken(id: string, oldRefreshTokenHash: string, newRefreshTokenHash: string): Promise<boolean> {
    const result = await db
      .update(sessions)
      .set({ refreshTokenHash: newRefreshTokenHash, lastSeenAt: new Date() })
      .where(and(eq(sessions.id, id), eq(sessions.refreshTokenHash, oldRefreshTokenHash), isNull(sessions.revokedAt)))
      .returning({ id: sessions.id });
    return result.length > 0;
  }

  async revoke(id: string): Promise<void> {
    await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, id));
  }

  async revokeAllByUserId(userId: string): Promise<void> {
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  }

  async updateLastSeenAt(id: string): Promise<void> {
    await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, id));
  }
}

export const sessionRepository = new SessionRepository();
