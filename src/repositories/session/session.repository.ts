import { and, eq, gt, isNull } from "drizzle-orm";
import { sessions } from "@/infra/database/schema";
import { db } from "@/infra/database/drizzle";
import type {
  ActiveSessionRecord,
  CreateSessionInput,
  RotateSessionInput,
  SessionRecord,
} from "./session.types";

export interface SessionRepository {
  create(input: CreateSessionInput): Promise<void>;
  findById(sessionId: string): Promise<SessionRecord | null>;
  /** Sessão existente, não revogada e não expirada (fonte de verdade do AuthHandler). */
  findActiveById(sessionId: string): Promise<ActiveSessionRecord | null>;
  /**
   * Rotação atômica (compare-and-swap): só atualiza se o hash esperado ainda
   * for o atual, a sessão não estiver revogada e não estiver expirada.
   * Retorna false quando outra requisição venceu a corrida.
   */
  rotateRefreshToken(input: RotateSessionInput): Promise<boolean>;
  /** Revoga a sessão do próprio usuário; idempotente. */
  revoke(sessionId: string, userId: string): Promise<boolean>;
}

export class DrizzleSessionRepository implements SessionRepository {
  async create(input: CreateSessionInput): Promise<void> {
    await db.insert(sessions).values({
      id: input.id,
      userId: input.userId,
      refreshTokenHash: input.refreshTokenHash,
      expiresAt: input.expiresAt,
    });
  }

  async findById(sessionId: string): Promise<SessionRecord | null> {
    const [row] = await db
      .select({
        id: sessions.id,
        userId: sessions.userId,
        refreshTokenHash: sessions.refreshTokenHash,
        expiresAt: sessions.expiresAt,
        revokedAt: sessions.revokedAt,
      })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    return row ?? null;
  }

  async findActiveById(sessionId: string): Promise<ActiveSessionRecord | null> {
    const [row] = await db
      .select({ id: sessions.id, userId: sessions.userId })
      .from(sessions)
      .where(
        and(
          eq(sessions.id, sessionId),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .limit(1);

    return row ?? null;
  }

  async rotateRefreshToken(input: RotateSessionInput): Promise<boolean> {
    const [updated] = await db
      .update(sessions)
      .set({
        refreshTokenHash: input.newRefreshTokenHash,
        expiresAt: input.newExpiresAt,
      })
      .where(
        and(
          eq(sessions.id, input.sessionId),
          eq(sessions.refreshTokenHash, input.expectedRefreshTokenHash),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .returning({ id: sessions.id });

    return updated !== undefined;
  }

  async revoke(sessionId: string, userId: string): Promise<boolean> {
    const [updated] = await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(sessions.id, sessionId),
          eq(sessions.userId, userId),
          isNull(sessions.revokedAt),
        ),
      )
      .returning({ id: sessions.id });

    return updated !== undefined;
  }
}

export const sessionRepository = new DrizzleSessionRepository();
