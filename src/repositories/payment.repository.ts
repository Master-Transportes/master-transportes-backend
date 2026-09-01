import { eq, sql } from "drizzle-orm";
import { APIError } from "encore.dev/api";
import { payments, paymentWebhookEvents, wallets, walletTransactions } from "@/infra/database/schema";
import { db } from "@/infra/database/drizzle";
import type {
  IPaymentRepository,
  PaymentRow,
  CreatePaymentData,
  WebhookEventRow,
  CreateWebhookEventData,
} from "./contracts/IPaymentRepository";
import type { PaymentStatus } from "@/infra/database/schema";

const PAYMENT_COLUMNS = {
  id: payments.id,
  walletId: payments.walletId,
  customerId: payments.customerId,
  amount: payments.amount,
  currency: payments.currency,
  provider: payments.provider,
  providerPaymentId: payments.providerPaymentId,
  status: payments.status,
  description: payments.description,
  paidAt: payments.paidAt,
  createdAt: payments.createdAt,
  updatedAt: payments.updatedAt,
} as const;

const WEBHOOK_EVENT_COLUMNS = {
  id: paymentWebhookEvents.id,
  provider: paymentWebhookEvents.provider,
  externalEventId: paymentWebhookEvents.externalEventId,
  eventType: paymentWebhookEvents.eventType,
  payload: paymentWebhookEvents.payload,
  processedAt: paymentWebhookEvents.processedAt,
  createdAt: paymentWebhookEvents.createdAt,
} as const;

export class PaymentRepository implements IPaymentRepository {
  async create(data: CreatePaymentData): Promise<PaymentRow> {
    const [row] = await db
      .insert(payments)
      .values({
        walletId: data.walletId,
        customerId: data.customerId,
        amount: data.amount,
        currency: data.currency ?? "BRL",
        provider: data.provider ?? "ASAAS",
        providerPaymentId: data.providerPaymentId ?? null,
        status: data.status ?? "PENDING",
        description: data.description ?? null,
      })
      .returning(PAYMENT_COLUMNS);
    return row;
  }

  async findById(id: string): Promise<PaymentRow | null> {
    const [row] = await db.select(PAYMENT_COLUMNS).from(payments).where(eq(payments.id, id)).limit(1);
    return row ?? null;
  }

  async findByProviderPaymentId(providerPaymentId: string): Promise<PaymentRow | null> {
    const [row] = await db
      .select(PAYMENT_COLUMNS)
      .from(payments)
      .where(eq(payments.providerPaymentId, providerPaymentId))
      .limit(1);
    return row ?? null;
  }

  async updateStatus(
    id: string,
    status: PaymentStatus,
    options?: { paidAt?: Date; providerPaymentId?: string },
  ): Promise<PaymentRow> {
    const updateData: Record<string, unknown> = {
      status,
      updatedAt: new Date(),
    };
    if (options?.paidAt !== undefined) {
      updateData.paidAt = options.paidAt;
    }
    if (options?.providerPaymentId !== undefined) {
      updateData.providerPaymentId = options.providerPaymentId;
    }

    const [row] = await db.update(payments).set(updateData).where(eq(payments.id, id)).returning(PAYMENT_COLUMNS);
    return row;
  }

  async confirmPaymentReceived(
    paymentId: string,
    walletId: string,
    amount: number,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await db.transaction(async tx => {
      const [payment] = await tx.select().from(payments).where(eq(payments.id, paymentId)).for("update").limit(1);
      if (!payment) throw APIError.notFound("Pagamento não encontrado.");
      if (payment.status === "RECEIVED") return;

      await tx
        .update(payments)
        .set({ status: "RECEIVED", paidAt: new Date(), updatedAt: new Date() })
        .where(eq(payments.id, paymentId));

      const [wallet] = await tx.select().from(wallets).where(eq(wallets.id, walletId)).for("update").limit(1);
      if (!wallet) throw APIError.notFound("Carteira não encontrada.");
      if (wallet.status !== "ACTIVE") throw APIError.failedPrecondition("Carteira não está ativa.");

      await tx
        .insert(walletTransactions)
        .values({
          walletId,
          type: "DEPOSIT",
          direction: "CREDIT",
          amount,
          status: "COMPLETED",
          reference: "Depósito via Pix",
          metadata,
        })
        .returning();

      await tx
        .update(wallets)
        .set({ balance: sql`${wallets.balance} + ${amount}`, updatedAt: new Date() })
        .where(eq(wallets.id, walletId));
    });
  }

  async refundPayment(
    paymentId: string,
    walletId: string,
    amount: number,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await db.transaction(async tx => {
      const [payment] = await tx.select().from(payments).where(eq(payments.id, paymentId)).for("update").limit(1);
      if (!payment) throw APIError.notFound("Pagamento não encontrado.");
      if (payment.status === "REFUNDED") return;

      const [wallet] = await tx.select().from(wallets).where(eq(wallets.id, walletId)).for("update").limit(1);
      if (!wallet) throw APIError.notFound("Carteira não encontrada.");
      if (wallet.status !== "ACTIVE") throw APIError.failedPrecondition("Carteira não está ativa.");
      if (wallet.balance < amount) throw APIError.failedPrecondition("Saldo insuficiente para estorno.");

      await tx.update(payments).set({ status: "REFUNDED", updatedAt: new Date() }).where(eq(payments.id, paymentId));

      await tx
        .insert(walletTransactions)
        .values({
          walletId,
          type: "REFUND",
          direction: "DEBIT",
          amount,
          status: "COMPLETED",
          reference: "Estorno de depósito via Pix",
          metadata,
        })
        .returning();

      await tx
        .update(wallets)
        .set({ balance: sql`${wallets.balance} - ${amount}`, updatedAt: new Date() })
        .where(eq(wallets.id, walletId));
    });
  }

  async findWebhookEventByExternalId(externalEventId: string): Promise<WebhookEventRow | null> {
    const [row] = await db
      .select(WEBHOOK_EVENT_COLUMNS)
      .from(paymentWebhookEvents)
      .where(eq(paymentWebhookEvents.externalEventId, externalEventId))
      .limit(1);
    if (!row) return null;
    return { ...row, payload: row.payload as Record<string, unknown> };
  }

  async createWebhookEvent(data: CreateWebhookEventData): Promise<WebhookEventRow> {
    const [row] = await db
      .insert(paymentWebhookEvents)
      .values({
        provider: data.provider,
        externalEventId: data.externalEventId,
        eventType: data.eventType,
        payload: data.payload,
      })
      .returning(WEBHOOK_EVENT_COLUMNS);
    return { ...row, payload: row.payload as Record<string, unknown> };
  }

  async markWebhookProcessed(externalEventId: string): Promise<void> {
    await db
      .update(paymentWebhookEvents)
      .set({ processedAt: new Date() })
      .where(eq(paymentWebhookEvents.externalEventId, externalEventId));
  }

  async deleteWebhookEvent(externalEventId: string): Promise<void> {
    await db.delete(paymentWebhookEvents).where(eq(paymentWebhookEvents.externalEventId, externalEventId));
  }
}

export const paymentRepository = new PaymentRepository();
