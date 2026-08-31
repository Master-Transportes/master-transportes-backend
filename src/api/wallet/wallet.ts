import { api } from "encore.dev/api";
import * as auth from "~encore/auth";
import { walletService } from "@/services/wallet.service";
import type { WalletResponse, WalletBalanceResponse } from "@/dto/wallet.interface";

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
