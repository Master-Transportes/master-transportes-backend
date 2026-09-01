import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { eq } from "drizzle-orm";
import type { IPaymentRepository, PaymentRow } from "@/repositories/contracts/IPaymentRepository";
import type { IWalletRepository } from "@/repositories/contracts/IWalletRepository";
import type { WalletDepositResponse } from "@/dto/wallet.interface";
import { paymentRepository, walletRepository, userRepository } from "@/repositories";
import * as asaas from "@/integrations/asaas/asaas.client";
import { parseWebhookEvent, validateWebhookToken } from "@/integrations/asaas/asaas.webhooks";
import type { AsaasWebhookEventValidated } from "@/integrations/asaas/asaas.webhooks";
import { walletService } from "./wallet.service";
import { db } from "@/infra/database/drizzle";
import { paymentWebhookEvents } from "@/infra/database/schema";
import { ASAAS_WEBHOOK_EVENTS } from "@/constants/wallet";
import { isValidCpf, isValidCnpj } from "@/utils/document";

export class PaymentService {
  constructor(
    private readonly paymentRepo: IPaymentRepository,
    private readonly walletRepo: IWalletRepository,
  ) {}

  async createDeposit(userId: string, amountInCents: number): Promise<WalletDepositResponse> {
    let wallet = await this.walletRepo.findByUserId(userId);
    if (!wallet) {
      wallet = await this.walletRepo.create(userId);
    }

    if (wallet.status !== "ACTIVE") {
      throw APIError.failedPrecondition("Carteira não está ativa.");
    }

    const user = await this.getUserInfo(userId);

    let asaasCustomer = await asaas.findCustomerByExternalReference(userId);

    if (!asaasCustomer) {
      const cpfCnpj = user.cpf ?? user.cnpj ?? "";
      if (cpfCnpj && !isValidCpf(cpfCnpj) && !isValidCnpj(cpfCnpj)) {
        throw APIError.failedPrecondition("CPF/CNPJ do usuário é inválido.");
      }

      asaasCustomer = await asaas.createCustomer({
        name: user.fullName,
        cpfCnpj,
        email: user.email,
        externalReference: userId,
      });
    }

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 1);

    const payment = await asaas.createPayment({
      customer: asaasCustomer.id,
      billingType: "PIX",
      value: amountInCents / 100,
      dueDate: dueDate.toISOString().split("T")[0],
      description: `Depósito na carteira - ${user.fullName}`,
      externalReference: `dep_${wallet.id}_${Date.now()}`,
    });

    const dbPayment = await this.paymentRepo.create({
      walletId: wallet.id,
      customerId: userId,
      amount: amountInCents,
      providerPaymentId: payment.id,
      description: `Depósito via Pix`,
    });

    const qrCode = await asaas.getPixQrCode(payment.id);

    return {
      paymentId: dbPayment.id,
      qrCodeBase64: qrCode.encodedImage,
      pixPayload: qrCode.payload,
      expirationDate: qrCode.expirationDate,
      amountInCents,
    };
  }

  async processWebhook(rawBody: unknown, authToken: string): Promise<void> {
    if (!validateWebhookToken(authToken)) {
      throw APIError.unauthenticated("Token de webhook inválido.");
    }

    const event = parseWebhookEvent(rawBody);

    try {
      const [existing] = await db
        .select({ id: paymentWebhookEvents.id })
        .from(paymentWebhookEvents)
        .where(eq(paymentWebhookEvents.externalEventId, event.id))
        .limit(1);

      if (existing) return;

      await db.insert(paymentWebhookEvents).values({
        provider: "ASAAS",
        externalEventId: event.id,
        eventType: event.event,
        payload: event as Record<string, unknown>,
      });

      if (event.event === ASAAS_WEBHOOK_EVENTS.PAYMENT_RECEIVED) {
        await this.handlePaymentReceived(event);
      }
    } catch (error) {
      log.error({ error, eventId: event.id, eventType: event.event }, "Erro ao processar webhook");
      throw error;
    }
  }

  private async handlePaymentReceived(event: AsaasWebhookEventValidated): Promise<void> {
    const payment = await this.paymentRepo.findByProviderPaymentId(event.payment.id);

    if (!payment) {
      return;
    }

    if (payment.status === "RECEIVED") {
      return;
    }

    await this.paymentRepo.updateStatus(payment.id, "RECEIVED", {
      paidAt: new Date(),
      providerPaymentId: event.payment.id,
    });

    await walletService.credit(payment.walletId, payment.amount, "DEPOSIT", {
      reference: "Depósito via Pix",
      metadata: {
        provider: "ASAAS",
        externalEventId: event.id,
        asaasPaymentId: event.payment.id,
        netValue: event.payment.netValue,
      },
    });
  }

  private async getUserInfo(userId: string): Promise<{
    fullName: string;
    email: string;
    cpf: string | null;
    cnpj: string | null;
  }> {
    const user = await userRepository.findById(userId);
    if (!user) throw APIError.notFound("Usuário não encontrado.");
    return {
      fullName: user.fullName,
      email: user.email,
      cpf: user.cpf,
      cnpj: user.cnpj,
    };
  }
}

export const paymentService = new PaymentService(paymentRepository, walletRepository);
