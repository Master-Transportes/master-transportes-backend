import { APIError } from "encore.dev/api";
import type { IWalletRepository, WalletRow } from "@/repositories/contracts/IWalletRepository";
import type { WalletResponse, WalletBalanceResponse } from "@/dto/wallet.interface";
import { walletRepository } from "@/repositories";

function toWalletResponse(wallet: WalletRow): WalletResponse {
  return {
    id: wallet.id,
    balance: wallet.balance,
    currency: wallet.currency,
  };
}

export class WalletService {
  constructor(private readonly walletRepo: IWalletRepository) {}

  async getWallet(userId: string): Promise<WalletResponse> {
    let wallet = await this.walletRepo.findByUserId(userId);

    if (!wallet) {
      wallet = await this.walletRepo.create(userId);
    }

    if (wallet.status !== "ACTIVE") {
      throw APIError.failedPrecondition("Carteira não está ativa.");
    }

    return toWalletResponse(wallet);
  }

  async getBalance(userId: string): Promise<WalletBalanceResponse> {
    let wallet = await this.walletRepo.findByUserId(userId);

    if (!wallet) {
      wallet = await this.walletRepo.create(userId);
    }

    if (wallet.status !== "ACTIVE") {
      throw APIError.failedPrecondition("Carteira não está ativa.");
    }

    return {
      balance: wallet.balance,
      currency: wallet.currency,
    };
  }
}

export const walletService = new WalletService(walletRepository);
