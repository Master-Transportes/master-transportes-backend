import { api } from "encore.dev/api";
import * as auth from "~encore/auth";
import { walletService } from "@/services/wallet.service";
import { paymentService } from "@/services/payment.service";
import type { PaginationParams, DepositParams } from "@/dto/client.interface";
import type { WalletResponse, WalletBalanceResponse, WalletTransactionListResponse } from "@/dto/wallet.interface";
import type { WalletDepositResponse } from "@/dto/payment.interface";

export const getWallet = api<void, WalletResponse>(
  { expose: true, method: "GET", path: "/client/wallet", auth: true },
  async () => {
    const { userID } = auth.getAuthData()!;
    return walletService.getWallet(userID, "USER");
  },
);

export const getBalance = api<void, WalletBalanceResponse>(
  { expose: true, method: "GET", path: "/client/wallet/balance", auth: true },
  async () => {
    const { userID } = auth.getAuthData()!;
    return walletService.getBalance(userID, "USER");
  },
);

export const listTransactions = api<PaginationParams, WalletTransactionListResponse>(
  { expose: true, method: "GET", path: "/client/wallet/transactions", auth: true },
  async params => {
    const { userID } = auth.getAuthData()!;
    return walletService.getTransactions(userID, "USER", {
      page: params.page ? Number(params.page) : undefined,
      limit: params.limit ? Number(params.limit) : undefined,
    });
  },
);

export const deposit = api<DepositParams, WalletDepositResponse>(
  { expose: true, method: "POST", path: "/client/wallet/deposit", auth: true },
  async payload => {
    const { userID } = auth.getAuthData()!;
    return paymentService.createDeposit(userID, payload.amountInCents);
  },
);
