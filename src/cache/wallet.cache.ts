import { redis } from "@/infra/cache/redis-client";
import { CACHE_KEYS } from "@/infra/cache/keys-cache";
import { WALLET_BALANCE_CACHE_TTL_SECONDS, withJitter } from "@/constants/cache";
import { safeJsonParse } from "@/utils/redis-helpers";
import { WalletBalanceSchema } from "@/schemas/cache-schemas";
import log from "encore.dev/log";
import type { IWalletCache, WalletCacheData } from "./contracts/IWalletCache";

export class RedisWalletCache implements IWalletCache {
  async getBalance(walletId: string): Promise<WalletCacheData | null> {
    try {
      const raw = await redis.get(CACHE_KEYS.WALLET_BALANCE(walletId));
      return safeJsonParse(raw, WalletBalanceSchema);
    } catch (err) {
      log.warn("Redis read failed for wallet balance", { error: err, walletId, component: "wallet-cache" });
      return null;
    }
  }

  async setBalance(walletId: string, data: WalletCacheData): Promise<void> {
    try {
      await redis.set(
        CACHE_KEYS.WALLET_BALANCE(walletId),
        JSON.stringify(data),
        "EX",
        withJitter(WALLET_BALANCE_CACHE_TTL_SECONDS),
      );
    } catch (err) {
      log.warn("Redis write failed for wallet balance", { error: err, walletId, component: "wallet-cache" });
    }
  }

  async invalidate(walletId: string): Promise<void> {
    try {
      await redis.del(CACHE_KEYS.WALLET_BALANCE(walletId));
    } catch (err) {
      log.warn("Redis invalidation failed for wallet", { error: err, walletId, component: "wallet-cache" });
    }
  }
}

export const walletCache = new RedisWalletCache();
