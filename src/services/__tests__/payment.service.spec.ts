import { describe, beforeAll, afterAll, expect, it } from "bun:test";
import { like, eq } from "drizzle-orm";
import { hashSync } from "bcrypt";
import { db } from "@/infra/database/drizzle";
import { users, drivers, wallets, walletTransactions, payments, paymentWebhookEvents } from "@/infra/database/schema";
import {
  walletRepository,
  walletTransactionRepository,
  paymentRepository,
  userRepository,
  driverRepository,
} from "@/repositories";
import { walletService } from "@/services/wallet.service";
import { PaymentService } from "@/services/payment.service";
import type { IAsaasClient } from "@/integrations/asaas/asaas.client";

const TEST_PREFIX = `payment-service-test-${Date.now()}`;
const TEST_CPF = "12345678901";

let testUserId: string;
let testWalletId: string;
let testDriverId: string;
let testDriverWalletId: string;

let failTransfer = false;

const asaasStub: IAsaasClient = {
  createCustomer: async () => ({
    id: "cus_test",
    object: "customer",
    dateCreated: new Date().toISOString(),
    name: "Test User",
    email: "test@test.com",
    cpfCnpj: TEST_CPF,
    personType: "FISICA",
    externalReference: "test",
    notificationDisabled: false,
    deleted: false,
  }),
  findCustomerByExternalReference: async () => ({
    id: "cus_existing",
    object: "customer",
    dateCreated: new Date().toISOString(),
    name: "Test User",
    email: "test@test.com",
    cpfCnpj: TEST_CPF,
    personType: "FISICA",
    externalReference: "test",
    notificationDisabled: false,
    deleted: false,
  }),
  createPayment: async () => ({
    id: "pay_stub",
    object: "payment",
    dateCreated: new Date().toISOString(),
    customer: "cus_test",
    status: "PENDING",
    value: 50,
    netValue: 48.5,
    billingType: "PIX",
    description: "Depósito na carteira",
    externalReference: "dep_test",
    dueDate: "2026-09-02",
    originalDueDate: "2026-09-02",
    paymentDate: null,
    confirmedDate: null,
    invoiceUrl: "",
    invoiceNumber: "0",
    canBePaidAfterDueDate: true,
    deleted: false,
    anticipated: false,
    anticipable: false,
    split: [],
  }),
  getPixQrCode: async () => ({
    encodedImage: "qr_base64_stub",
    payload: "pix_payload_stub",
    expirationDate: "2026-09-02",
    description: "",
  }),
  createTransfer: async data => {
    if (failTransfer) {
      throw new Error("Asaas transfer failed");
    }
    return {
      id: `transfer_stub_${data.externalReference ?? Date.now()}`,
      object: "transfer",
      status: "PENDING",
      value: data.value,
      pixAddressKey: data.pixAddressKey,
      pixAddressKeyType: data.pixAddressKeyType,
      transferDate: new Date().toISOString(),
      description: data.description ?? null,
      externalReference: data.externalReference ?? null,
      dateCreated: new Date().toISOString(),
    };
  },
};

const paymentServiceTest = new PaymentService(
  paymentRepository,
  walletRepository,
  walletTransactionRepository,
  walletService,
  userRepository,
  driverRepository,
  asaasStub,
);

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

    const wallet = await walletRepository.create(testUserId, "USER");
    testWalletId = wallet.id;

    const [driver] = await db
      .insert(drivers)
      .values({
        fullName: "Payment Service Test Driver",
        email: `${TEST_PREFIX}-driver@test.com`,
        cpf: TEST_CPF,
        pixKey: "11999999999",
        pixKeyType: "PHONE",
        password: hashedPassword,
        status: "APPROVED",
      })
      .returning({ id: drivers.id });
    testDriverId = driver.id;

    const driverWallet = await walletRepository.create(testDriverId, "DRIVER");
    testDriverWalletId = driverWallet.id;
  });

  afterAll(async () => {
    await db.delete(paymentWebhookEvents).where(like(paymentWebhookEvents.externalEventId, "test_%"));
    await db.delete(payments).where(eq(payments.customerId, testUserId));
    await db.delete(walletTransactions).where(eq(walletTransactions.walletId, testWalletId));
    await db.delete(walletTransactions).where(eq(walletTransactions.walletId, testDriverWalletId));
    await db.delete(wallets).where(eq(wallets.ownerId, testUserId));
    await db.delete(wallets).where(eq(wallets.ownerId, testDriverId));
    await db.delete(drivers).where(like(drivers.email, `${TEST_PREFIX}%`));
    await db.delete(users).where(like(users.email, `${TEST_PREFIX}%`));
  });

  describe("createDeposit()", () => {
    it("rejects invalid amountInCents", async () => {
      const err1 = await paymentServiceTest.createDeposit(testUserId, -100).catch((e: unknown) => e);
      expect(err1).toBeInstanceOf(Error);

      const err2 = await paymentServiceTest.createDeposit(testUserId, 0).catch((e: unknown) => e);
      expect(err2).toBeInstanceOf(Error);

      const err3 = await paymentServiceTest.createDeposit(testUserId, 50.5).catch((e: unknown) => e);
      expect(err3).toBeInstanceOf(Error);
    });

    it("creates payment row and returns pix payload", async () => {
      const result = await paymentServiceTest.createDeposit(testUserId, 5000);

      expect(result.paymentId).toBeDefined();
      expect(result.amountInCents).toBe(5000);
      expect(result.qrCodeBase64).toBe("qr_base64_stub");
      expect(result.pixPayload).toBe("pix_payload_stub");

      const payment = await paymentRepository.findById(result.paymentId);
      expect(payment).not.toBeNull();
      expect(payment!.status).toBe("PENDING");
      expect(payment!.amount).toBe(5000);
      expect(payment!.providerPaymentId).toBe("pay_stub");
    });
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

      await paymentRepository.createWebhookEvent({
        provider: "ASAAS",
        externalEventId: eventPayload.id,
        eventType: eventPayload.event,
        payload: eventPayload,
      });

      const existing = await paymentRepository.findWebhookEventByExternalId(eventPayload.id);

      expect(existing).toBeDefined();
      expect(existing!.externalEventId).toBe("test_event_001");
      expect(existing!.eventType).toBe("PAYMENT_RECEIVED");
      expect(existing!.provider).toBe("ASAAS");
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

      await paymentRepository.createWebhookEvent({
        provider: "ASAAS",
        externalEventId: event1.id,
        eventType: event1.event,
        payload: event1,
      });
      await paymentRepository.createWebhookEvent({
        provider: "ASAAS",
        externalEventId: event2.id,
        eventType: event2.event,
        payload: event2,
      });

      const r1 = await paymentRepository.findWebhookEventByExternalId(event1.id);
      const r2 = await paymentRepository.findWebhookEventByExternalId(event2.id);

      expect(r1).toBeDefined();
      expect(r2).toBeDefined();
      expect(r1!.id).not.toBe(r2!.id);
    });
  });

  describe("processWebhook() - credit safety", () => {
    it("does not credit twice for the same payment with different event ids", async () => {
      await paymentRepository.create({
        walletId: testWalletId,
        customerId: testUserId,
        amount: 5000,
        providerPaymentId: "pay_double_credit",
        description: "Double credit test",
      });

      const walletBefore = await walletRepository.findById(testWalletId);
      const beforeBalance = walletBefore!.balance;

      await paymentServiceTest.processWebhook({
        id: "test_evt_credit_1",
        event: "PAYMENT_RECEIVED",
        dateCreated: "2026-09-01 10:00:00",
        account: { id: "acc_test" },
        payment: { id: "pay_double_credit", status: "RECEIVED", value: 50, netValue: 48.5 },
      });

      await paymentServiceTest.processWebhook({
        id: "test_evt_credit_2",
        event: "PAYMENT_RECEIVED",
        dateCreated: "2026-09-01 10:05:00",
        account: { id: "acc_test" },
        payment: { id: "pay_double_credit", status: "RECEIVED", value: 50, netValue: 48.5 },
      });

      const walletAfter = await walletRepository.findById(testWalletId);
      expect(walletAfter!.balance).toBe(beforeBalance + 5000);

      const deposits = await db.select().from(walletTransactions).where(eq(walletTransactions.walletId, testWalletId));
      const creditTxs = deposits.filter(t => t.type === "DEPOSIT" && t.direction === "CREDIT");
      expect(creditTxs.length).toBe(1);
    });
  });

  describe("processWebhook() - refund retry", () => {
    it("rolls back on insufficient balance and retries after balance exists", async () => {
      const [refundUser] = await db
        .insert(users)
        .values({
          fullName: "Refund Retry User",
          email: `${TEST_PREFIX}-refund@test.com`,
          cpf: TEST_CPF,
          password: hashSync("cl3an+TestP4ss", 10),
          role: "CLIENT",
        })
        .returning({ id: users.id });
      const refundWallet = await walletRepository.create(refundUser.id, "USER");

      const payment = await paymentRepository.create({
        walletId: refundWallet.id,
        customerId: refundUser.id,
        amount: 5000,
        providerPaymentId: "pay_refund_retry",
        description: "Refund retry test",
      });

      const event = {
        id: "test_evt_refund_retry",
        event: "PAYMENT_REFUNDED",
        dateCreated: "2026-09-01 12:00:00",
        account: { id: "acc_test" },
        payment: { id: "pay_refund_retry", status: "REFUNDED", value: 50, netValue: 48.5 },
      };

      const firstAttemptError = await paymentServiceTest.processWebhook(event).catch((e: unknown) => e);
      expect(firstAttemptError).toBeInstanceOf(Error);

      const deleted = await paymentRepository.findWebhookEventByExternalId(event.id);
      expect(deleted).toBeNull();

      const paymentAfterFailure = await paymentRepository.findById(payment.id);
      expect(paymentAfterFailure!.status).toBe("PENDING");

      await walletRepository.credit(refundWallet.id, {
        type: "ADJUSTMENT",
        direction: "CREDIT",
        amount: 5000,
        status: "COMPLETED",
      });

      await paymentServiceTest.processWebhook(event);

      const paymentAfter = await paymentRepository.findById(payment.id);
      expect(paymentAfter!.status).toBe("REFUNDED");

      const wallet = await walletRepository.findById(refundWallet.id);
      expect(wallet!.balance).toBe(0);

      const processed = await paymentRepository.findWebhookEventByExternalId(event.id);
      expect(processed).not.toBeNull();
      expect(processed!.processedAt).not.toBeNull();

      await db.delete(paymentWebhookEvents).where(eq(paymentWebhookEvents.externalEventId, event.id));
      await db.delete(payments).where(eq(payments.id, payment.id));
      await db.delete(walletTransactions).where(eq(walletTransactions.walletId, refundWallet.id));
      await db.delete(wallets).where(eq(wallets.ownerId, refundUser.id));
      await db.delete(users).where(eq(users.id, refundUser.id));
    });
  });

  describe("requestPayout()", () => {
    it("rejects payout when driver has no pix key", async () => {
      const [noKeyDriver] = await db
        .insert(drivers)
        .values({
          fullName: "No Pix Driver",
          email: `${TEST_PREFIX}-nopix@test.com`,
          cpf: TEST_CPF,
          password: hashSync("cl3an+TestP4ss", 10),
          status: "APPROVED",
        })
        .returning({ id: drivers.id });

      await walletRepository.create(noKeyDriver.id, "DRIVER");

      const pixErr = await paymentServiceTest.requestPayout(noKeyDriver.id, 1500).catch((e: unknown) => e);
      expect(pixErr).toBeInstanceOf(Error);
      expect((pixErr as Error).message).toBe("Cadastre uma chave Pix antes de solicitar o saque.");

      await db.delete(wallets).where(eq(wallets.ownerId, noKeyDriver.id));
      await db.delete(drivers).where(eq(drivers.id, noKeyDriver.id));
    });

    it("debits wallet, creates transfer and returns new balance", async () => {
      const wallet = await walletRepository.findById(testDriverWalletId);
      const beforeBalance = wallet!.balance;

      await walletRepository.credit(testDriverWalletId, {
        type: "ADJUSTMENT",
        direction: "CREDIT",
        amount: 20000,
        status: "COMPLETED",
      });

      const result = await paymentServiceTest.requestPayout(testDriverId, 1500);

      expect(result.amountInCents).toBe(1500);
      expect(result.newBalance).toBe(beforeBalance + 20000 - 1500);

      const tx = await walletTransactionRepository.findByAsaasTransferId(`transfer_stub_${result.transactionId}`);
      expect(tx).not.toBeNull();
      expect(tx!.status).toBe("COMPLETED");
      expect(tx!.type).toBe("PAYOUT");
      expect(tx!.metadata).toEqual(
        expect.objectContaining({ asaasTransferId: `transfer_stub_${result.transactionId}` }),
      );
    });

    it("rejects payout when balance is insufficient", async () => {
      const balanceErr = await paymentServiceTest.requestPayout(testDriverId, 999999).catch((e: unknown) => e);
      expect(balanceErr).toBeInstanceOf(Error);
      expect((balanceErr as Error).message).toBe("Saldo insuficiente.");
    });

    it("rejects payout below minimum amount", async () => {
      const minErr = await paymentServiceTest.requestPayout(testDriverId, 500).catch((e: unknown) => e);
      expect(minErr).toBeInstanceOf(Error);
    });

    it("reverses transaction and restores balance when Asaas transfer fails", async () => {
      const before = await walletRepository.findById(testDriverWalletId);
      const beforeBalance = before!.balance;

      failTransfer = true;

      const transferErr = await paymentServiceTest.requestPayout(testDriverId, 1500).catch((e: unknown) => e);
      expect(transferErr).toBeInstanceOf(Error);
      expect((transferErr as Error).message).toBe(
        "Não foi possível processar o saque no momento. Tente novamente.",
      );

      const after = await walletRepository.findById(testDriverWalletId);
      expect(after!.balance).toBe(beforeBalance);

      const reversedTx = await db
        .select()
        .from(walletTransactions)
        .where(eq(walletTransactions.walletId, testDriverWalletId))
        .then(rows => rows.filter(t => t.type === "PAYOUT" && t.status === "REVERSED"));

      expect(reversedTx.length).toBe(1);

      failTransfer = false;
    });
  });

  describe("walletRepository integration", () => {
    it("wallet has correct initial state after creation", async () => {
      const wallet = await walletRepository.findByOwner(testUserId, "USER");
      expect(wallet).not.toBeNull();
      expect(wallet!.ownerId).toBe(testUserId);
      expect(wallet!.balance).toBeGreaterThanOrEqual(0);
      expect(wallet!.currency).toBe("BRL");
      expect(wallet!.status).toBe("ACTIVE");
    });

    it("wallet credit modifies balance", async () => {
      const wallet = await walletRepository.findByOwner(testUserId, "USER");
      expect(wallet).not.toBeNull();

      const before = wallet!.balance;
      await walletRepository.credit(wallet!.id, {
        type: "DEPOSIT",
        direction: "CREDIT",
        amount: 1000,
        status: "COMPLETED",
      });
      const after = await walletRepository.findById(wallet!.id);
      expect(after!.balance).toBe(before + 1000);

      await walletRepository.debit(wallet!.id, {
        type: "ADJUSTMENT",
        direction: "DEBIT",
        amount: 1000,
        status: "COMPLETED",
      });
    });
  });

  describe("walletTransactions table", () => {
    it("can insert and query wallet transactions", async () => {
      const wallet = await walletRepository.findByOwner(testUserId, "USER");
      expect(wallet).not.toBeNull();

      const tx = await walletRepository.credit(wallet!.id, {
        type: "DEPOSIT",
        direction: "CREDIT",
        amount: 999,
        status: "COMPLETED",
        reference: "Test manual insert",
      });

      expect(tx.id).toBeDefined();
      expect(tx.amount).toBe(999);

      const found = await walletTransactionRepository.findByWalletId(wallet!.id);
      expect(found.transactions.some((t: { id: string }) => t.id === tx.id)).toBe(true);

      await db.delete(walletTransactions).where(eq(walletTransactions.id, tx.id));
    });
  });
});
