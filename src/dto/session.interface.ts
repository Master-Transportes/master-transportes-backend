import type { Role } from "@/infra/drizzle/schema";

export interface Session {
  sessionId: string;
  userId: string;
  role: Role;
  refreshHash: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
}
