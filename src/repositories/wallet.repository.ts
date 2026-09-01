import { APIError } from "encore.dev/api";
import { and, eq, sql } from "drizzle-orm";
import { wallets, walletTransactions } from "@/infra/database/schema";
import { db } from "@/infra/database/drizzle";
import type { IWalletRepository, WalletRow, WalletOwnerType, CreditDebitData } from "./contracts/IWalletRepository";
import type { WalletTransactionRow } from "./contracts/IWalletTransactionRepository";

const WALLET_COLUMNS = {
  id: wallets.id,
  ownerId: wallets.ownerId,
  ownerType: wallets.ownerType,
  balance: wallets.balance,
  currency: wallets.currency,
  status: wallets.status,
  createdAt: wallets.createdAt,
  updatedAt: wallets.updatedAt,
} as const;

function toWalletRow(row: typeof wallets.$inferSelect): WalletRow {
  return {
    ...row,
    ownerType: row.ownerType as WalletOwnerType,
  };
}

function toTransactionRow(row: typeof walletTransactions.$inferSelect): WalletTransactionRow {
  return {
    id: row.id,
    walletId: row.walletId,
    rideId: row.rideId,
    type: row.type,
    direction: row.direction,
    amount: row.amount,
    status: row.status,
    reference: row.reference,
    metadata: row.metadata as Record<string, unknown> | null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class WalletRepository implements IWalletRepository {
  async findByOwner(ownerId: string, ownerType: WalletOwnerType): Promise<WalletRow | null> {
    const [wallet] = await db
      .select(WALLET_COLUMNS)
      .from(wallets)
      .where(and(eq(wallets.ownerId, ownerId), eq(wallets.ownerType, ownerType)))
      .limit(1);
    return wallet ? toWalletRow(wallet) : null;
  }

  async findById(id: string): Promise<WalletRow | null> {
    const [wallet] = await db.select(WALLET_COLUMNS).from(wallets).where(eq(wallets.id, id)).limit(1);
    return wallet ? toWalletRow(wallet) : null;
  }

  async create(ownerId: string, ownerType: WalletOwnerType): Promise<WalletRow> {
    const [wallet] = await db.insert(wallets).values({ ownerId, ownerType }).returning(WALLET_COLUMNS);
    return toWalletRow(wallet);
  }

  async credit(walletId: string, data: CreditDebitData): Promise<WalletTransactionRow> {
    return db.transaction(async tx => {
      const [wallet] = await tx.select().from(wallets).where(eq(wallets.id, walletId)).for("update").limit(1);

      if (!wallet) throw APIError.notFound("Carteira não encontrada.");
      if (wallet.status !== "ACTIVE") throw APIError.failedPrecondition("Carteira não está ativa.");

      const [txEntry] = await tx
        .insert(walletTransactions)
        .values({
          walletId,
          rideId: data.rideId ?? null,
          type: data.type,
          direction: "CREDIT",
          amount: data.amount,
          status: data.status,
          reference: data.reference ?? null,
          metadata: data.metadata ?? null,
        })
        .returning();

      await tx
        .update(wallets)
        .set({ balance: sql`${wallets.balance} + ${data.amount}`, updatedAt: new Date() })
        .where(eq(wallets.id, walletId));

      return toTransactionRow(txEntry);
    });
  }

  async debit(walletId: string, data: CreditDebitData): Promise<WalletTransactionRow> {
    return db.transaction(async tx => {
      const [wallet] = await tx.select().from(wallets).where(eq(wallets.id, walletId)).for("update").limit(1);

      if (!wallet) throw APIError.notFound("Carteira não encontrada.");
      if (wallet.status !== "ACTIVE") throw APIError.failedPrecondition("Carteira não está ativa.");
      if (wallet.balance < data.amount) throw APIError.failedPrecondition("Saldo insuficiente.");

      const [txEntry] = await tx
        .insert(walletTransactions)
        .values({
          walletId,
          rideId: data.rideId ?? null,
          type: data.type,
          direction: "DEBIT",
          amount: data.amount,
          status: data.status,
          reference: data.reference ?? null,
          metadata: data.metadata ?? null,
        })
        .returning();

      await tx
        .update(wallets)
        .set({ balance: sql`${wallets.balance} - ${data.amount}`, updatedAt: new Date() })
        .where(eq(wallets.id, walletId));

      return toTransactionRow(txEntry);
    });
  }

  async completePendingTransaction(txId: string): Promise<boolean> {
    return db.transaction(async tx => {
      const [txEntry] = await tx
        .select()
        .from(walletTransactions)
        .where(eq(walletTransactions.id, txId))
        .for("update")
        .limit(1);
      if (!txEntry) throw APIError.notFound("Transação não encontrada.");
      if (txEntry.status !== "PENDING") return false;

      await tx
        .update(walletTransactions)
        .set({ status: "COMPLETED", updatedAt: new Date() })
        .where(eq(walletTransactions.id, txId));

      return true;
    });
  }

  async attachTransferReference(txId: string, asaasTransferId: string): Promise<void> {
    await db
      .update(walletTransactions)
      .set({
        metadata: sql`jsonb_set(COALESCE(${walletTransactions.metadata}, '{}'::jsonb), '{asaasTransferId}', to_jsonb(${asaasTransferId}::text))`,
        updatedAt: new Date(),
      })
      .where(eq(walletTransactions.id, txId));
  }

  async reverseTransaction(txId: string): Promise<boolean> {
    return db.transaction(async tx => {
      const [txEntry] = await tx
        .select()
        .from(walletTransactions)
        .where(eq(walletTransactions.id, txId))
        .for("update")
        .limit(1);
      if (!txEntry) throw APIError.notFound("Transação não encontrada.");
      if (txEntry.status !== "PENDING") return false;

      await tx
        .update(walletTransactions)
        .set({ status: "REVERSED", updatedAt: new Date() })
        .where(eq(walletTransactions.id, txId));

      await tx
        .update(wallets)
        .set({ balance: sql`${wallets.balance} + ${txEntry.amount}`, updatedAt: new Date() })
        .where(eq(wallets.id, txEntry.walletId));

      return true;
    });
  }
}

export const walletRepository = new WalletRepository();
