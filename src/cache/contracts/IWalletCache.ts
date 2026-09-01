export interface WalletCacheData {
  balance: number;
  currency: string;
}

export interface IWalletCache {
  getBalance(walletId: string): Promise<WalletCacheData | null>;
  setBalance(walletId: string, data: WalletCacheData): Promise<void>;
  invalidate(walletId: string): Promise<void>;
}
