import { APIError } from "encore.dev/api";
import { validateOrThrow } from "@/validations/schema-validator";
import { ListTransactionsSchema, PayoutSchema } from "@/validations/dto/wallet.validate";
import type { WalletTransactionType } from "@/infra/database/types";
import type { IWalletRepository, WalletRow, WalletOwnerType } from "@/repositories/contracts/IWalletRepository";
import type {
  IWalletTransactionRepository,
  WalletTransactionRow,
} from "@/repositories/contracts/IWalletTransactionRepository";
import type { IWalletCache } from "@/cache/contracts/IWalletCache";
import type {
  WalletResponse,
  WalletBalanceResponse,
  WalletTransactionItem,
  WalletTransactionListResponse,
  PayoutResponse,
} from "@/dto/wallet.interface";
import { walletRepository, walletTransactionRepository } from "@/repositories";
import { walletCache } from "@/cache";

function toWalletResponse(wallet: WalletRow): WalletResponse {
  return {
    id: wallet.id,
    balance: wallet.balance,
    currency: wallet.currency,
  };
}

function toTransactionItem(row: WalletTransactionRow): WalletTransactionItem {
  return {
    id: row.id,
    type: row.type,
    direction: row.direction,
    amount: row.amount,
    status: row.status,
    reference: row.reference,
    createdAt: row.createdAt,
  };
}

export class WalletService {
  constructor(
    private readonly walletRepo: IWalletRepository,
    private readonly txRepo: IWalletTransactionRepository,
    private readonly walletCache: IWalletCache,
  ) {}

  private async findOrCreateWallet(ownerId: string, ownerType: WalletOwnerType): Promise<WalletRow> {
    let wallet = await this.walletRepo.findByOwner(ownerId, ownerType);
    if (!wallet) {
      wallet = await this.walletRepo.create(ownerId, ownerType);
    }
    if (wallet.status !== "ACTIVE") {
      throw APIError.failedPrecondition("Carteira não está ativa.");
    }
    return wallet;
  }

  async getWallet(ownerId: string, ownerType: WalletOwnerType): Promise<WalletResponse> {
    const wallet = await this.findOrCreateWallet(ownerId, ownerType);
    return toWalletResponse(wallet);
  }

  async getBalance(ownerId: string, ownerType: WalletOwnerType): Promise<WalletBalanceResponse> {
    const wallet = await this.findOrCreateWallet(ownerId, ownerType);

    const cached = await this.walletCache.getBalance(wallet.id);
    if (cached) {
      return cached;
    }

    await this.walletCache.setBalance(wallet.id, {
      balance: wallet.balance,
      currency: wallet.currency,
    });

    return {
      balance: wallet.balance,
      currency: wallet.currency,
    };
  }

  async getTransactions(
    ownerId: string,
    ownerType: WalletOwnerType,
    options?: { page?: number; limit?: number },
  ): Promise<WalletTransactionListResponse> {
    const validated = validateOrThrow(ListTransactionsSchema, options ?? {});
    const wallet = await this.findOrCreateWallet(ownerId, ownerType);
    const result = await this.txRepo.findByWalletId(wallet.id, {
      page: validated.page,
      limit: validated.limit,
    });

    return {
      transactions: result.transactions.map(toTransactionItem),
      total: result.total,
      page: validated.page,
      limit: validated.limit,
    };
  }

  async credit(
    walletId: string,
    amount: number,
    type: WalletTransactionType,
    options?: { rideId?: string; reference?: string; metadata?: Record<string, unknown> },
  ): Promise<WalletTransactionRow> {
    const txEntry = await this.walletRepo.credit(walletId, {
      type,
      direction: "CREDIT",
      amount,
      status: "COMPLETED",
      rideId: options?.rideId,
      reference: options?.reference,
      metadata: options?.metadata,
    });

    await this.walletCache.invalidate(walletId);

    return txEntry;
  }

  async debit(
    walletId: string,
    amount: number,
    type: WalletTransactionType,
    options?: { rideId?: string; reference?: string; metadata?: Record<string, unknown> },
  ): Promise<WalletTransactionRow> {
    const txEntry = await this.walletRepo.debit(walletId, {
      type,
      direction: "DEBIT",
      amount,
      status: "COMPLETED",
      rideId: options?.rideId,
      reference: options?.reference,
      metadata: options?.metadata,
    });

    await this.walletCache.invalidate(walletId);

    return txEntry;
  }

  async requestPayout(ownerId: string, ownerType: WalletOwnerType, amountInCents: number): Promise<PayoutResponse> {
    const validated = validateOrThrow(PayoutSchema, { amountInCents });
    const wallet = await this.findOrCreateWallet(ownerId, ownerType);

    const txEntry = await this.debit(wallet.id, validated.amountInCents, "PAYOUT", {
      reference: "Saque via Pix",
    });

    const updatedWallet = await this.walletRepo.findById(wallet.id);

    return {
      transactionId: txEntry.id,
      amountInCents: validated.amountInCents,
      newBalance: updatedWallet!.balance,
    };
  }

  async invalidateCache(walletId: string): Promise<void> {
    await this.walletCache.invalidate(walletId);
  }
}

export const walletService = new WalletService(walletRepository, walletTransactionRepository, walletCache);
