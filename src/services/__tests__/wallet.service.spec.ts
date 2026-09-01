import { describe, beforeAll, afterAll, expect, it } from "bun:test";
import { like, eq } from "drizzle-orm";
import { hashSync } from "bcrypt";
import { walletService } from "@/services/wallet.service";
import { walletRepository } from "@/repositories";
import { db } from "@/infra/database/drizzle";
import { users, wallets, walletTransactions } from "@/infra/database/schema";

const TEST_PREFIX = `wallet-service-test-${Date.now()}`;
const DEFAULT_PASSWORD = "cl3an+TestP4ss";
const TEST_CPF = "12345678901";

let testUserId: string;

describe("WalletService", () => {
  beforeAll(async () => {
    const email = `${TEST_PREFIX}@test.com`;
    const hashedPassword = hashSync(DEFAULT_PASSWORD, 10);
    const [user] = await db
      .insert(users)
      .values({
        fullName: "Wallet Service Test User",
        email,
        cpf: TEST_CPF,
        password: hashedPassword,
        role: "CLIENT",
      })
      .returning({ id: users.id });
    testUserId = user.id;
  });

  afterAll(async () => {
    const wallet = await walletRepository.findByOwner(testUserId, "USER");
    if (wallet) {
      await db.delete(walletTransactions).where(eq(walletTransactions.walletId, wallet.id));
      await db.delete(wallets).where(eq(wallets.ownerId, testUserId));
    }
    await db.delete(users).where(like(users.email, `${TEST_PREFIX}%`));
  });

  describe("getWallet()", () => {
    it("creates wallet on first access with balance 0", async () => {
      const result = await walletService.getWallet(testUserId, "USER");
      expect(result.balance).toBe(0);
      expect(result.currency).toBe("BRL");
      expect(typeof result.id).toBe("string");
      expect(result.id.length).toBeGreaterThan(0);
    });

    it("returns existing wallet on subsequent calls", async () => {
      const first = await walletService.getWallet(testUserId, "USER");
      const second = await walletService.getWallet(testUserId, "USER");
      expect(first.id).toBe(second.id);
    });

    it("returns correct fields matching database", async () => {
      const result = await walletService.getWallet(testUserId, "USER");
      const dbWallet = await walletRepository.findByOwner(testUserId, "USER");
      expect(dbWallet).not.toBeNull();
      expect(result.id).toBe(dbWallet!.id);
      expect(result.balance).toBe(dbWallet!.balance);
      expect(result.currency).toBe(dbWallet!.currency);
    });
  });

  describe("getBalance()", () => {
    it("returns balance and currency", async () => {
      const result = await walletService.getBalance(testUserId, "USER");
      expect(result).toHaveProperty("balance");
      expect(result).toHaveProperty("currency");
      expect(result.currency).toBe("BRL");
      expect(typeof result.balance).toBe("number");
    });

    it("creates wallet on first access if not exists", async () => {
      const email2 = `${TEST_PREFIX}-balance@test.com`;
      const hashedPassword = hashSync(DEFAULT_PASSWORD, 10);
      const [user] = await db
        .insert(users)
        .values({
          fullName: "Balance Test User",
          email: email2,
          cpf: TEST_CPF,
          password: hashedPassword,
          role: "CLIENT",
        })
        .returning({ id: users.id });

      const result = await walletService.getBalance(user.id, "USER");
      expect(result.balance).toBe(0);
      expect(result.currency).toBe("BRL");

      await db.delete(users).where(eq(users.id, user.id));
    });

    it("does not create duplicate wallet", async () => {
      await walletService.getBalance(testUserId, "USER");
      await walletService.getBalance(testUserId, "USER");

      const allWallets = await db.select().from(wallets).where(eq(wallets.ownerId, testUserId));
      expect(allWallets.length).toBe(1);
    });
  });

  describe("credit()", () => {
    it("credits wallet and creates transaction", async () => {
      const wallet = await walletService.getWallet(testUserId, "USER");
      const tx = await walletService.credit(wallet.id, 5000, "DEPOSIT", {
        reference: "Test deposit",
        metadata: { test: true },
      });

      expect(tx.amount).toBe(5000);
      expect(tx.direction).toBe("CREDIT");
      expect(tx.type).toBe("DEPOSIT");
      expect(tx.status).toBe("COMPLETED");
      expect(tx.reference).toBe("Test deposit");

      const balance = await walletService.getBalance(testUserId, "USER");
      expect(balance.balance).toBe(5000);
    });

    it("credits multiple times correctly", async () => {
      const wallet = await walletService.getWallet(testUserId, "USER");
      await walletService.credit(wallet.id, 3000, "DEPOSIT");
      await walletService.credit(wallet.id, 2000, "DEPOSIT");

      const balance = await walletService.getBalance(testUserId, "USER");
      expect(balance.balance).toBe(10000);
    });

    it("stores metadata in transaction", async () => {
      const wallet = await walletService.getWallet(testUserId, "USER");
      const tx = await walletService.credit(wallet.id, 1000, "DEPOSIT", {
        reference: "Metadata test",
        metadata: { key1: "value1", nested: { key2: 42 } },
      });

      expect(tx.metadata).toEqual({ key1: "value1", nested: { key2: 42 } });
    });

    it("rejects credit to non-existent wallet", async () => {
      await expect(walletService.credit("00000000-0000-0000-0000-000000000000", 1000, "DEPOSIT")).rejects.toThrow(
        "Carteira não encontrada.",
      );
    });
  });

  describe("debit()", () => {
    it("debits wallet and creates transaction", async () => {
      const wallet = await walletService.getWallet(testUserId, "USER");
      const tx = await walletService.debit(wallet.id, 2000, "PAYOUT", {
        reference: "Test payout",
      });

      expect(tx.amount).toBe(2000);
      expect(tx.direction).toBe("DEBIT");
      expect(tx.type).toBe("PAYOUT");
      expect(tx.status).toBe("COMPLETED");
      expect(tx.reference).toBe("Test payout");

      const balance = await walletService.getBalance(testUserId, "USER");
      expect(balance.balance).toBe(9000);
    });

    it("rejects debit when insufficient balance", async () => {
      const wallet = await walletService.getWallet(testUserId, "USER");
      await expect(walletService.debit(wallet.id, 999999, "PAYOUT")).rejects.toThrow("Saldo insuficiente");
    });

    it("rejects debit to non-existent wallet", async () => {
      await expect(walletService.debit("00000000-0000-0000-0000-000000000000", 1000, "PAYOUT")).rejects.toThrow(
        "Carteira não encontrada.",
      );
    });

    it("debit updates wallet balance correctly", async () => {
      const wallet = await walletService.getWallet(testUserId, "USER");
      const before = await walletService.getBalance(testUserId, "USER");
      await walletService.debit(wallet.id, 1000, "PAYOUT");
      const after = await walletService.getBalance(testUserId, "USER");
      expect(after.balance).toBe(before.balance - 1000);
    });
  });

  describe("requestPayout()", () => {
    it("debits wallet and returns new balance", async () => {
      await walletService.getWallet(testUserId, "USER");
      const before = await walletService.getBalance(testUserId, "USER");

      const result = await walletService.requestPayout(testUserId, "USER", 1500);

      expect(result.transactionId).toBeDefined();
      expect(result.amountInCents).toBe(1500);
      expect(result.newBalance).toBe(before.balance - 1500);
    });

    it("rejects payout when insufficient balance", async () => {
      await expect(walletService.requestPayout(testUserId, "USER", 999999)).rejects.toThrow("Saldo insuficiente");
    });

    it("rejects payout below minimum amount", async () => {
      await expect(walletService.requestPayout(testUserId, "USER", 500)).rejects.toThrow();
    });

    it("creates wallet on first access for payout", async () => {
      const email2 = `${TEST_PREFIX}-payout@test.com`;
      const hashedPassword = hashSync(DEFAULT_PASSWORD, 10);
      const [user] = await db
        .insert(users)
        .values({
          fullName: "Payout Test User",
          email: email2,
          cpf: TEST_CPF,
          password: hashedPassword,
          role: "CLIENT",
        })
        .returning({ id: users.id });

      await expect(walletService.requestPayout(user.id, "USER", 5000)).rejects.toThrow("Saldo insuficiente");

      await db.delete(users).where(eq(users.id, user.id));
    });
  });

  describe("getTransactions()", () => {
    it("returns paginated transactions", async () => {
      const result = await walletService.getTransactions(testUserId, "USER", { page: 1, limit: 10 });
      expect(result.transactions.length).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(0);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
    });

    it("returns correct transaction structure", async () => {
      const result = await walletService.getTransactions(testUserId, "USER", { page: 1, limit: 1 });
      const tx = result.transactions[0];
      expect(tx).toHaveProperty("id");
      expect(tx).toHaveProperty("type");
      expect(tx).toHaveProperty("direction");
      expect(tx).toHaveProperty("amount");
      expect(tx).toHaveProperty("status");
      expect(tx).toHaveProperty("createdAt");
      expect(typeof tx.id).toBe("string");
      expect(["CREDIT", "DEBIT"]).toContain(tx.direction);
    });

    it("returns correct pagination defaults", async () => {
      const result = await walletService.getTransactions(testUserId, "USER");
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it("respects page and limit parameters", async () => {
      const result = await walletService.getTransactions(testUserId, "USER", { page: 1, limit: 2 });
      expect(result.limit).toBe(2);
      expect(result.transactions.length).toBeLessThanOrEqual(2);
    });

    it("returns empty for page beyond data", async () => {
      const result = await walletService.getTransactions(testUserId, "USER", { page: 999, limit: 10 });
      expect(result.transactions.length).toBe(0);
    });
  });
});
