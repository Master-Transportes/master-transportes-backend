import type { PaymentStatus } from "@/infra/database/schema";

export interface PaymentRow {
  id: string;
  walletId: string;
  customerId: string;
  amount: number;
  currency: string;
  provider: string;
  providerPaymentId: string | null;
  status: PaymentStatus;
  description: string | null;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePaymentData {
  walletId: string;
  customerId: string;
  amount: number;
  currency?: string;
  provider?: string;
  providerPaymentId?: string;
  status?: PaymentStatus;
  description?: string;
}

export interface IPaymentRepository {
  create(data: CreatePaymentData): Promise<PaymentRow>;
  findById(id: string): Promise<PaymentRow | null>;
  findByProviderPaymentId(providerPaymentId: string): Promise<PaymentRow | null>;
  updateStatus(
    id: string,
    status: PaymentStatus,
    options?: { paidAt?: Date; providerPaymentId?: string },
  ): Promise<PaymentRow>;
}
