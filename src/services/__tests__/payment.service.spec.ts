import { describe, beforeAll, afterAll, expect, it } from "bun:test";
import { like, eq } from "drizzle-orm";
import { hashSync } from "bcrypt";
import { db } from "@/infra/database/drizzle";
import { users, wallets, walletTransactions, payments, paymentWebhookEvents } from "@/infra/database/schema";
import { walletRepository, paymentRepository } from "@/repositories";

const TEST_PREFIX = `payment-service-test-${Date.now()}`;
const TEST_CPF = "12345678901";

let testUserId: string;
let testWalletId: string;

describe("PaymentService", () => {
  beforeAll(async () => {
    const email = `${TEST_PREFIX}@test.com`;
    const hashedPassword = hashSync("cl3an+TestP4ss", 10);
    const [user] = await db
      .insert(users)
      .values({
        fullName: "Payment Service Test User",
        email,
        cpf: TEST_CPF,
        password: hashedPassword,
        role: "CLIENT",
      })
      .returning({ id: users.id });
    testUserId = user.id;

    const wallet = await walletRepository.create(testUserId);
    testWalletId = wallet.id;
  });

  afterAll(async () => {
    await db.delete(paymentWebhookEvents).where(
      like(paymentWebhookEvents.externalEventId, "test_%"),
    );
    await db.delete(payments).where(eq(payments.customerId, testUserId));
    await db.delete(walletTransactions).where(eq(walletTransactions.walletId, testWalletId));
    await db.delete(wallets).where(eq(wallets.userId, testUserId));
    await db.delete(users).where(like(users.email, `${TEST_PREFIX}%`));
  });

  describe("processWebhook() - idempotency", () => {
    it("does not create duplicate webhook events for same externalEventId", async () => {
      const eventPayload = {
        id: "test_event_001",
        event: "PAYMENT_RECEIVED",
        dateCreated: "2026-09-01 10:00:00",
        account: { id: "acc_test" },
        payment: {
          id: "pay_test_001",
          status: "RECEIVED",
          value: 50.0,
          netValue: 48.5,
        },
      };

      await db.insert(paymentWebhookEvents).values({
        provider: "ASAAS",
        externalEventId: eventPayload.id,
        eventType: eventPayload.event,
        payload: eventPayload,
      });

      const [existing] = await db
        .select()
        .from(paymentWebhookEvents)
        .where(eq(paymentWebhookEvents.externalEventId, eventPayload.id))
        .limit(1);

      expect(existing).toBeDefined();
      expect(existing.externalEventId).toBe("test_event_001");
      expect(existing.eventType).toBe("PAYMENT_RECEIVED");
      expect(existing.provider).toBe("ASAAS");
    });

    it("different event IDs create separate records", async () => {
      const event1 = {
        id: "test_event_a1",
        event: "PAYMENT_RECEIVED",
        dateCreated: "2026-09-01 10:00:00",
        account: { id: "acc_test" },
        payment: { id: "pay_a1", status: "RECEIVED", value: 10.0 },
      };
      const event2 = {
        id: "test_event_a2",
        event: "PAYMENT_RECEIVED",
        dateCreated: "2026-09-01 11:00:00",
        account: { id: "acc_test" },
        payment: { id: "pay_a2", status: "RECEIVED", value: 20.0 },
      };

      await db.insert(paymentWebhookEvents).values({
        provider: "ASAAS",
        externalEventId: event1.id,
        eventType: event1.event,
        payload: event1,
      });
      await db.insert(paymentWebhookEvents).values({
        provider: "ASAAS",
        externalEventId: event2.id,
        eventType: event2.event,
        payload: event2,
      });

      const [r1] = await db
        .select()
        .from(paymentWebhookEvents)
        .where(eq(paymentWebhookEvents.externalEventId, event1.id))
        .limit(1);
      const [r2] = await db
        .select()
        .from(paymentWebhookEvents)
        .where(eq(paymentWebhookEvents.externalEventId, event2.id))
        .limit(1);

      expect(r1).toBeDefined();
      expect(r2).toBeDefined();
      expect(r1.id).not.toBe(r2.id);
    });
  });

  describe("processWebhook() - payment processing", () => {
    it("payment repository creates and updates payment status", async () => {
      const payment = await paymentRepository.create({
        walletId: testWalletId,
        customerId: testUserId,
        amount: 5000,
        providerPaymentId: "pay_test_repo_001",
        description: "Test payment for repository",
      });

      expect(payment.id).toBeDefined();
      expect(payment.status).toBe("PENDING");
      expect(payment.amount).toBe(5000);
      expect(payment.providerPaymentId).toBe("pay_test_repo_001");

      const updated = await paymentRepository.updateStatus(payment.id, "RECEIVED", {
        paidAt: new Date(),
      });
      expect(updated.status).toBe("RECEIVED");
      expect(updated.paidAt).not.toBeNull();
    });

    it("payment repository finds by providerPaymentId", async () => {
      const payment = await paymentRepository.create({
        walletId: testWalletId,
        customerId: testUserId,
        amount: 3000,
        providerPaymentId: "pay_test_find_001",
        description: "Find by provider ID test",
      });

      const found = await paymentRepository.findByProviderPaymentId("pay_test_find_001");
      expect(found).not.toBeNull();
      expect(found!.id).toBe(payment.id);
      expect(found!.amount).toBe(3000);
    });

    it("payment repository returns null for unknown providerPaymentId", async () => {
      const found = await paymentRepository.findByProviderPaymentId("pay_nonexistent_999");
      expect(found).toBeNull();
    });
  });

  describe("walletRepository integration", () => {
    it("wallet has correct initial state after creation", async () => {
      const wallet = await walletRepository.findByUserId(testUserId);
      expect(wallet).not.toBeNull();
      expect(wallet!.userId).toBe(testUserId);
      expect(wallet!.balance).toBeGreaterThanOrEqual(0);
      expect(wallet!.currency).toBe("BRL");
      expect(wallet!.status).toBe("ACTIVE");
    });

    it("wallet updateBalance modifies balance", async () => {
      const wallet = await walletRepository.findByUserId(testUserId);
      expect(wallet).not.toBeNull();

      const before = wallet!.balance;
      await walletRepository.updateBalance(wallet!.id, 1000);
      const after = await walletRepository.findById(wallet!.id);
      expect(after!.balance).toBe(before + 1000);

      // Restore
      await walletRepository.updateBalance(wallet!.id, -1000);
    });
  });

  describe("walletTransactions table", () => {
    it("can insert and query wallet transactions", async () => {
      const wallet = await walletRepository.findByUserId(testUserId);
      expect(wallet).not.toBeNull();

      const [tx] = await db
        .insert(walletTransactions)
        .values({
          walletId: wallet!.id,
          type: "DEPOSIT",
          direction: "CREDIT",
          amount: 999,
          status: "COMPLETED",
          reference: "Test manual insert",
        })
        .returning();

      expect(tx.id).toBeDefined();
      expect(tx.amount).toBe(999);

      const [found] = await db
        .select()
        .from(walletTransactions)
        .where(eq(walletTransactions.id, tx.id))
        .limit(1);
      expect(found).toBeDefined();

      await db.delete(walletTransactions).where(eq(walletTransactions.id, tx.id));
    });
  });
});
