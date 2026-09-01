import type { WalletStatus } from "@/infra/database/schema";

export interface WalletRow {
  id: string;
  userId: string;
  balance: number;
  currency: string;
  status: WalletStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface IWalletRepository {
  findByUserId(userId: string): Promise<WalletRow | null>;
  findById(id: string): Promise<WalletRow | null>;
  create(userId: string): Promise<WalletRow>;
  updateBalance(id: string, amount: number): Promise<WalletRow>;
}
