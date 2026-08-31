import { eq } from "drizzle-orm";
import { wallets } from "@/infra/database/schema";
import { db } from "@/infra/database/drizzle";
import type { IWalletRepository, WalletRow } from "./contracts/IWalletRepository";

const WALLET_COLUMNS = {
  id: wallets.id,
  userId: wallets.userId,
  balance: wallets.balance,
  currency: wallets.currency,
  status: wallets.status,
  createdAt: wallets.createdAt,
  updatedAt: wallets.updatedAt,
} as const;

export class WalletRepository implements IWalletRepository {
  async findByUserId(userId: string): Promise<WalletRow | null> {
    const [wallet] = await db
      .select(WALLET_COLUMNS)
      .from(wallets)
      .where(eq(wallets.userId, userId))
      .limit(1);
    return wallet ?? null;
  }

  async create(userId: string): Promise<WalletRow> {
    const [wallet] = await db
      .insert(wallets)
      .values({ userId })
      .returning(WALLET_COLUMNS);
    return wallet;
  }
}

export const walletRepository = new WalletRepository();
