import { redis } from "@/infra/cache/redis-client";
import { CACHE_KEYS } from "@/infra/cache/keys-cache";
import { WALLET_BALANCE_CACHE_TTL_SECONDS } from "@/constants/cache";
import type { IWalletCache, WalletCacheData } from "./contracts/IWalletCache";

export class RedisWalletCache implements IWalletCache {
  async getBalance(walletId: string): Promise<WalletCacheData | null> {
    const raw = await redis.get(CACHE_KEYS.WALLET_BALANCE(walletId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed as WalletCacheData;
  }

  async setBalance(walletId: string, data: WalletCacheData): Promise<void> {
    await redis.set(
      CACHE_KEYS.WALLET_BALANCE(walletId),
      JSON.stringify(data),
      "EX",
      WALLET_BALANCE_CACHE_TTL_SECONDS,
    );
  }

  async invalidate(walletId: string): Promise<void> {
    await redis.del(CACHE_KEYS.WALLET_BALANCE(walletId));
  }
}

export const walletCache = new RedisWalletCache();
