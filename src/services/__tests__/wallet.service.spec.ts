import { describe, beforeAll, afterAll, expect, it } from "bun:test";
import { like, eq } from "drizzle-orm";
import { hashSync } from "bcrypt";
import { walletService } from "@/services/wallet.service";
import { walletRepository } from "@/repositories";
import { db } from "@/infra/database/drizzle";
import { users, wallets } from "@/infra/database/schema";

const TEST_PREFIX = `wallet-test-${Date.now()}`;
const DEFAULT_PASSWORD = "cl3an+TestP4ss";

let testUserId: string;
let testUserEmail: string;

describe("WalletService", () => {
  beforeAll(async () => {
    testUserEmail = `${TEST_PREFIX}@test.com`;
    const hashedPassword = hashSync(DEFAULT_PASSWORD, 10);
    const [user] = await db
      .insert(users)
      .values({
        fullName: "Wallet Test Suite User",
        email: testUserEmail,
        password: hashedPassword,
        role: "CLIENT",
      })
      .returning({ id: users.id });
    testUserId = user.id;
  });

  afterAll(async () => {
    await Promise.all([
      db.delete(wallets).where(eq(wallets.userId, testUserId)),
      db.delete(users).where(like(users.email, `${TEST_PREFIX}%`)),
    ]);
  });

  describe("getWallet()", () => {
    it("creates wallet on first access with balance 0", async () => {
      const result = await walletService.getWallet(testUserId);

      expect(result).toHaveProperty("id");
      expect(typeof result.id).toBe("string");
      expect(result.id.length).toBeGreaterThan(0);

      expect(result.balance).toBe(0);
      expect(result.currency).toBe("BRL");
    });

    it("returns existing wallet if already created", async () => {
      const first = await walletService.getWallet(testUserId);
      const second = await walletService.getWallet(testUserId);

      expect(first.id).toBe(second.id);
    });

    it("returns correct id, balance, currency", async () => {
      const result = await walletService.getWallet(testUserId);

      const dbWallet = await walletRepository.findByUserId(testUserId);
      expect(dbWallet).not.toBeNull();

      expect(result.id).toBe(dbWallet!.id);
      expect(result.balance).toBe(dbWallet!.balance);
      expect(result.currency).toBe(dbWallet!.currency);
    });
  });

  describe("getBalance()", () => {
    it("creates wallet on first access", async () => {
      const result = await walletService.getBalance(testUserId);

      expect(result).toHaveProperty("balance");
      expect(result).toHaveProperty("currency");
      expect(result.balance).toBe(0);
      expect(result.currency).toBe("BRL");
    });

    it("returns balance and currency", async () => {
      const result = await walletService.getBalance(testUserId);

      expect(typeof result.balance).toBe("number");
      expect(typeof result.currency).toBe("string");
    });

    it("does not create a duplicate wallet", async () => {
      await walletService.getBalance(testUserId);
      await walletService.getBalance(testUserId);

      const allWallets = await db
        .select()
        .from(wallets)
        .where(eq(wallets.userId, testUserId));

      expect(allWallets.length).toBe(1);
    });
  });
});
