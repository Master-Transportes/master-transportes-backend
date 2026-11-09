/**
 * Identidade — vocabulário público de papéis e status de conta.
 *
 * Estes enums são TypeScript puros (não dependem do Drizzle) e podem ser
 * usados em DTOs públicos da API. As mesmas listas alimentam os enums
 * PostgreSQL em infra/database/schema.ts, garantindo fonte única de verdade.
 */

export enum AccountStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  BANNED = "BANNED",
}

/** Papéis de uma conta. ADMIN e SUPPORT são privilegiados e nunca concedidos por cadastro público. */
export enum AuthRole {
  Client = "CLIENT",
  Driver = "DRIVER",
  Admin = "ADMIN",
  Support = "SUPPORT",
}

export const ACCOUNT_STATUSES = [AccountStatus.ACTIVE, AccountStatus.INACTIVE, AccountStatus.BANNED] as const;

export const ROLES = [AuthRole.Client, AuthRole.Driver, AuthRole.Admin, AuthRole.Support] as const;
