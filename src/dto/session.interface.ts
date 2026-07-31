import type { Role } from "./shared.types.ts";

export interface Session {
  sessionId: string;
  userId: string;
  role: Role;
  refreshHash: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
}
