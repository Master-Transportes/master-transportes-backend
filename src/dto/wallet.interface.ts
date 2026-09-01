import type {
  WalletTransactionType,
  WalletTransactionDirection,
  WalletTransactionStatus,
} from "@/infra/database/types";

export interface WalletResponse {
  id: string;
  balance: number;
  currency: string;
}

export interface WalletBalanceResponse {
  balance: number;
  currency: string;
}

export interface WalletTransactionItem {
  id: string;
  type: WalletTransactionType;
  direction: WalletTransactionDirection;
  amount: number;
  status: WalletTransactionStatus;
  reference: string | null;
  createdAt: Date;
}

export interface WalletTransactionListResponse {
  transactions: WalletTransactionItem[];
  total: number;
  page: number;
  limit: number;
}

export interface PayoutResponse {
  transactionId: string;
  amountInCents: number;
  newBalance: number;
}
