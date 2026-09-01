import type { WalletStatus } from "@/infra/database/schema";
import type {
  WalletTransactionType,
  WalletTransactionDirection,
  WalletTransactionStatus,
} from "@/infra/database/types";
import type { WalletTransactionRow } from "./IWalletTransactionRepository";

export type WalletOwnerType = "USER" | "DRIVER";

export interface WalletRow {
  id: string;
  ownerId: string;
  ownerType: WalletOwnerType;
  balance: number;
  currency: string;
  status: WalletStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreditDebitData {
  rideId?: string;
  type: WalletTransactionType;
  direction: WalletTransactionDirection;
  amount: number;
  status: WalletTransactionStatus;
  reference?: string;
  metadata?: Record<string, unknown>;
}

export interface IWalletRepository {
  findByOwner(ownerId: string, ownerType: WalletOwnerType): Promise<WalletRow | null>;
  findById(id: string): Promise<WalletRow | null>;
  create(ownerId: string, ownerType: WalletOwnerType): Promise<WalletRow>;
  credit(walletId: string, data: CreditDebitData): Promise<WalletTransactionRow>;
  debit(walletId: string, data: CreditDebitData): Promise<WalletTransactionRow>;
  attachTransferReference(txId: string, asaasTransferId: string): Promise<void>;
  completePendingTransaction(txId: string): Promise<boolean>;
  reverseTransaction(txId: string): Promise<boolean>;
}
