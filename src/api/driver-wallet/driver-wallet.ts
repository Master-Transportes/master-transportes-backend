import { api } from "encore.dev/api";
import * as auth from "~encore/auth";
import { driverWalletService } from "@/services/driver-wallet.service";
import { walletService } from "@/services/wallet.service";
import { paymentService } from "@/services/payment.service";
import type { PaginationParams, DepositParams } from "@/dto/client.interface";
import type { UpdatePixKeyDTO, DriverWalletInformationResponse } from "@/dto/driver.interface";
import type {
  WalletResponse,
  WalletBalanceResponse,
  WalletTransactionListResponse,
  PayoutResponse,
} from "@/dto/wallet.interface";

export const updatePixKey = api<UpdatePixKeyDTO, DriverWalletInformationResponse>(
  { expose: true, method: "PUT", path: "/driver/pix-key", auth: true },
  async payload => {
    const { userID } = auth.getAuthData()!;
    return driverWalletService.updatePixKey(userID, payload);
  },
);

export const getInformationWallet = api<void, DriverWalletInformationResponse>(
  { expose: true, method: "GET", path: "/driver/wallet/information", auth: true },
  async () => {
    const { userID } = auth.getAuthData()!;
    return driverWalletService.getWalletInformation(userID);
  },
);

export const getWallet = api<void, WalletResponse>(
  { expose: true, method: "GET", path: "/driver/wallet", auth: true },
  async () => {
    const { userID } = auth.getAuthData()!;
    return walletService.getWallet(userID, "DRIVER");
  },
);

export const getBalance = api<void, WalletBalanceResponse>(
  { expose: true, method: "GET", path: "/driver/wallet/balance", auth: true },
  async () => {
    const { userID } = auth.getAuthData()!;
    return walletService.getBalance(userID, "DRIVER");
  },
);

export const listTransactions = api<PaginationParams, WalletTransactionListResponse>(
  { expose: true, method: "GET", path: "/driver/wallet/transactions", auth: true },
  async params => {
    const { userID } = auth.getAuthData()!;
    return walletService.getTransactions(userID, "DRIVER", {
      page: params.page ? Number(params.page) : undefined,
      limit: params.limit ? Number(params.limit) : undefined,
    });
  },
);

export const requestPayout = api<DepositParams, PayoutResponse>(
  { expose: true, method: "POST", path: "/driver/wallet/payout", auth: true },
  async payload => {
    const { userID } = auth.getAuthData()!;
    return paymentService.requestPayout(userID, payload.amountInCents);
  },
);
