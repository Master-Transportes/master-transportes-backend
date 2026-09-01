import { eq, count, sql } from "drizzle-orm";
import { walletTransactions } from "@/infra/database/schema";
import { db } from "@/infra/database/drizzle";
import type {
  IWalletTransactionRepository,
  WalletTransactionRow,
  CreateWalletTransactionData,
} from "./contracts/IWalletTransactionRepository";

function toRow(raw: typeof walletTransactions.$inferSelect): WalletTransactionRow {
  return {
    id: raw.id,
    walletId: raw.walletId,
    rideId: raw.rideId,
    type: raw.type,
    direction: raw.direction,
    amount: raw.amount,
    status: raw.status,
    reference: raw.reference,
    metadata: raw.metadata as Record<string, unknown> | null,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export class WalletTransactionRepository implements IWalletTransactionRepository {
  async create(data: CreateWalletTransactionData): Promise<WalletTransactionRow> {
    const [row] = await db
      .insert(walletTransactions)
      .values({
        walletId: data.walletId,
        rideId: data.rideId ?? null,
        type: data.type,
        direction: data.direction,
        amount: data.amount,
        status: data.status,
        reference: data.reference ?? null,
        metadata: data.metadata ?? null,
      })
      .returning();
    return toRow(row);
  }

  async findByWalletId(
    walletId: string,
    options?: { page?: number; limit?: number },
  ): Promise<{ transactions: WalletTransactionRow[]; total: number }> {
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 20;
    const offset = (page - 1) * limit;

    const [countResult] = await db
      .select({ total: count() })
      .from(walletTransactions)
      .where(eq(walletTransactions.walletId, walletId));

    const rows = await db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.walletId, walletId))
      .orderBy(sql`${walletTransactions.createdAt} DESC`)
      .limit(limit)
      .offset(offset);

    return {
      transactions: rows.map(toRow),
      total: countResult?.total ?? 0,
    };
  }

  async findByAsaasTransferId(asaasTransferId: string): Promise<WalletTransactionRow | null> {
    const [row] = await db
      .select()
      .from(walletTransactions)
      .where(sql`${walletTransactions.metadata}->>'asaasTransferId' = ${asaasTransferId}`)
      .limit(1);
    return row ? toRow(row) : null;
  }
}

export const walletTransactionRepository = new WalletTransactionRepository();
