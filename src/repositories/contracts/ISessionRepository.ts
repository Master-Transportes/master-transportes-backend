import type { SessionRow, NewSession } from "@/infra/database/schema";

export interface ISessionRepository {
  create(data: NewSession): Promise<SessionRow>;
  findById(id: string): Promise<SessionRow | null>;
  findByRefreshTokenHash(hash: string): Promise<SessionRow | null>;
  findActiveByUserId(userId: string): Promise<SessionRow | null>;
  findActiveByDeviceId(userId: string, deviceId: string): Promise<SessionRow | null>;
  findAllActiveByUserId(userId: string): Promise<SessionRow[]>;
  rotateRefreshToken(id: string, newRefreshTokenHash: string): Promise<void>;
  revoke(id: string): Promise<void>;
  revokeAllByUserId(userId: string): Promise<void>;
  updateLastSeenAt(id: string): Promise<void>;
}
