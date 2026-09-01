import { api } from "encore.dev/api";
import * as auth from "~encore/auth";
import { walletService } from "@/services/wallet.service";
import { paymentService } from "@/services/payment.service";
import type {
  WalletResponse,
  WalletBalanceResponse,
  WalletTransactionListResponse,
  WalletDepositResponse,
} from "@/dto/wallet.interface";
import { ListTransactionsSchema, DepositSchema } from "@/validations/dto/wallet.validate";
import { validateOrThrow } from "@/validations/schema-validator";

export const getWallet = api<void, WalletResponse>(
  { expose: true, method: "GET", path: "/wallet", auth: true },
  async () => {
    const { userID } = auth.getAuthData()!;
    return walletService.getWallet(userID);
  },
);

export const getBalance = api<void, WalletBalanceResponse>(
  { expose: true, method: "GET", path: "/wallet/balance", auth: true },
  async () => {
    const { userID } = auth.getAuthData()!;
    return walletService.getBalance(userID);
  },
);

export const listTransactions = api<{ page?: string; limit?: string }, WalletTransactionListResponse>(
  { expose: true, method: "GET", path: "/wallet/transactions", auth: true },
  async (params) => {
    const { userID } = auth.getAuthData()!;
    const validated = validateOrThrow(ListTransactionsSchema, {
      page: params.page ? Number(params.page) : undefined,
      limit: params.limit ? Number(params.limit) : undefined,
    });
    return walletService.getTransactions(userID, {
      page: validated.page,
      limit: validated.limit,
    });
  },
);

export const deposit = api<{ amountInCents: number }, WalletDepositResponse>(
  { expose: true, method: "POST", path: "/wallet/deposit", auth: true },
  async (payload) => {
    const { userID } = auth.getAuthData()!;
    const validated = validateOrThrow(DepositSchema, payload);
    return paymentService.createDeposit(userID, validated.amountInCents);
  },
);
