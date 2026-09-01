import { eq } from "drizzle-orm";
import { payments } from "@/infra/database/schema";
import { db } from "@/infra/database/drizzle";
import type { IPaymentRepository, PaymentRow, CreatePaymentData } from "./contracts/IPaymentRepository";
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
}

export const paymentRepository = new PaymentRepository();
