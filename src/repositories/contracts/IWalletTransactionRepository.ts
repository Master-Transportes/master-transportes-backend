import type {
  WalletTransactionType,
  WalletTransactionDirection,
  WalletTransactionStatus,
} from "@/infra/database/schema";

export interface WalletTransactionRow {
  id: string;
  walletId: string;
  rideId: string | null;
  type: WalletTransactionType;
  direction: WalletTransactionDirection;
  amount: number;
  status: WalletTransactionStatus;
  reference: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWalletTransactionData {
  walletId: string;
  rideId?: string;
  type: WalletTransactionType;
  direction: WalletTransactionDirection;
  amount: number;
  status: WalletTransactionStatus;
  reference?: string;
  metadata?: Record<string, unknown>;
}

export interface IWalletTransactionRepository {
  create(data: CreateWalletTransactionData): Promise<WalletTransactionRow>;
  findByWalletId(
    walletId: string,
    options?: { page?: number; limit?: number },
  ): Promise<{ transactions: WalletTransactionRow[]; total: number }>;
  findByExternalEventId(provider: string, externalEventId: string): Promise<WalletTransactionRow | null>;
}
