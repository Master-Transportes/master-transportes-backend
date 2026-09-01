import { APIError } from "encore.dev/api";
import { eq, sql } from "drizzle-orm";
import { db } from "@/infra/database/drizzle";
import { wallets, walletTransactions } from "@/infra/database/schema";
import type { WalletTransactionType } from "@/infra/database/types";
import type { IWalletRepository, WalletRow } from "@/repositories/contracts/IWalletRepository";
import type {
  IWalletTransactionRepository,
  WalletTransactionRow,
} from "@/repositories/contracts/IWalletTransactionRepository";
import type {
  WalletResponse,
  WalletBalanceResponse,
  WalletTransactionItem,
  WalletTransactionListResponse,
} from "@/dto/wallet.interface";
import { walletRepository, walletTransactionRepository } from "@/repositories";

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
  ) {}

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

  async getTransactions(
    userId: string,
    options?: { page?: number; limit?: number },
  ): Promise<WalletTransactionListResponse> {
    let wallet = await this.walletRepo.findByUserId(userId);

    if (!wallet) {
      wallet = await this.walletRepo.create(userId);
    }

    const result = await this.txRepo.findByWalletId(wallet.id, options);

    return {
      transactions: result.transactions.map(toTransactionItem),
      total: result.total,
      page: options?.page ?? 1,
      limit: options?.limit ?? 20,
    };
  }

  async credit(
    walletId: string,
    amount: number,
    type: WalletTransactionType,
    options?: { rideId?: string; reference?: string; metadata?: Record<string, unknown> },
  ): Promise<WalletTransactionRow> {
    return db.transaction(async tx => {
      const [wallet] = await tx.select().from(wallets).where(eq(wallets.id, walletId)).for("update").limit(1);

      if (!wallet) throw APIError.notFound("Carteira não encontrada.");
      if (wallet.status !== "ACTIVE") throw APIError.failedPrecondition("Carteira não está ativa.");

      const [txEntry] = await tx
        .insert(walletTransactions)
        .values({
          walletId,
          rideId: options?.rideId ?? null,
          type,
          direction: "CREDIT",
          amount,
          status: "COMPLETED",
          reference: options?.reference ?? null,
          metadata: options?.metadata ?? null,
        })
        .returning();

      await tx
        .update(wallets)
        .set({ balance: sql`${wallets.balance} + ${amount}`, updatedAt: new Date() })
        .where(eq(wallets.id, walletId));

      return txEntry as WalletTransactionRow;
    });
  }

  async debit(
    walletId: string,
    amount: number,
    type: WalletTransactionType,
    options?: { rideId?: string; reference?: string; metadata?: Record<string, unknown> },
  ): Promise<WalletTransactionRow> {
    return db.transaction(async tx => {
      const [wallet] = await tx.select().from(wallets).where(eq(wallets.id, walletId)).for("update").limit(1);

      if (!wallet) throw APIError.notFound("Carteira não encontrada.");
      if (wallet.status !== "ACTIVE") throw APIError.failedPrecondition("Carteira não está ativa.");
      if (wallet.balance < amount) throw APIError.failedPrecondition("Saldo insuficiente.");

      const [txEntry] = await tx
        .insert(walletTransactions)
        .values({
          walletId,
          rideId: options?.rideId ?? null,
          type,
          direction: "DEBIT",
          amount,
          status: "COMPLETED",
          reference: options?.reference ?? null,
          metadata: options?.metadata ?? null,
        })
        .returning();

      await tx
        .update(wallets)
        .set({ balance: sql`${wallets.balance} - ${amount}`, updatedAt: new Date() })
        .where(eq(wallets.id, walletId));

      return txEntry as WalletTransactionRow;
    });
  }

  async findByUserId(userId: string): Promise<WalletRow | null> {
    return this.walletRepo.findByUserId(userId);
  }
}

export const walletService = new WalletService(walletRepository, walletTransactionRepository);
