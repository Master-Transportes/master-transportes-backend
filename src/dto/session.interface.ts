import type { Role } from "@/interfaces/user-types";

export interface Session {
  sessionId: string;
  userId: string;
  role: Role;
  refreshHash: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
}
