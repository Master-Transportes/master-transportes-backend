import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import type { IPaymentRepository } from "@/repositories/contracts/IPaymentRepository";
import type { IWalletRepository } from "@/repositories/contracts/IWalletRepository";
import type { IUserRepository } from "@/repositories/contracts/IUserRepository";
import type { WalletDepositResponse } from "@/dto/payment.interface";
import { paymentRepository, walletRepository, userRepository } from "@/repositories";
import * as asaas from "@/integrations/asaas/asaas.client";
import type { AsaasWebhookEvent } from "@/integrations/asaas/asaas.webhook-types";
import type { WalletService } from "./wallet.service";
import { walletService } from "./wallet.service";
import { ASAAS_WEBHOOK_EVENTS } from "@/constants/asaas";
import { isValidCpf, isValidCnpj } from "@/utils/document";
import { isPgUniqueViolation } from "@/utils/database";

export class PaymentService {
  constructor(
    private readonly paymentRepo: IPaymentRepository,
    private readonly walletRepo: IWalletRepository,
    private readonly walletService: WalletService,
    private readonly userRepo: IUserRepository,
  ) {}

  async createDeposit(userId: string, amountInCents: number): Promise<WalletDepositResponse> {
    let wallet = await this.walletRepo.findByOwner(userId, "USER");
    if (!wallet) {
      wallet = await this.walletRepo.create(userId, "USER");
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

  async processWebhook(rawBody: unknown): Promise<void> {
    const event = rawBody as AsaasWebhookEvent;

    try {
      const existing = await this.paymentRepo.findWebhookEventByExternalId(event.id);
      if (existing) return;

      try {
        await this.paymentRepo.createWebhookEvent({
          provider: "ASAAS",
          externalEventId: event.id,
          eventType: event.event,
          payload: event as unknown as Record<string, unknown>,
        });
      } catch (error: unknown) {
        if (isPgUniqueViolation(error)) return;
        throw error;
      }

      switch (event.event) {
        case ASAAS_WEBHOOK_EVENTS.PAYMENT_RECEIVED:
          await this.handlePaymentReceived(event);
          break;
        case ASAAS_WEBHOOK_EVENTS.PAYMENT_OVERDUE:
          await this.handlePaymentOverdue(event);
          break;
        case ASAAS_WEBHOOK_EVENTS.PAYMENT_REFUNDED:
          await this.handlePaymentRefunded(event);
          break;
        case ASAAS_WEBHOOK_EVENTS.PAYMENT_CREATED:
        case ASAAS_WEBHOOK_EVENTS.PAYMENT_CONFIRMED:
        case ASAAS_WEBHOOK_EVENTS.PAYMENT_UPDATED:
          log.info("Evento Asaas registrado (sem ação)", { eventId: event.id, eventType: event.event });
          break;
        default:
          log.warn("Evento Asaas não tratado", { eventId: event.id, eventType: event.event });
      }
    } catch (error) {
      log.error({ error, eventId: event.id, eventType: event.event }, "Erro ao processar webhook");
      throw error;
    }
  }

  private async handlePaymentReceived(event: AsaasWebhookEvent): Promise<void> {
    if (!event.payment) return;

    const payment = await this.paymentRepo.findByProviderPaymentId(event.payment.id);
    if (!payment) return;
    if (payment.status === "RECEIVED") return;

    await this.paymentRepo.confirmPaymentReceived(payment.id, payment.walletId, payment.amount, {
      provider: "ASAAS",
      externalEventId: event.id,
      asaasPaymentId: event.payment.id,
      netValue: event.payment.netValue,
    });

    await this.walletService.invalidateCache(payment.walletId);
  }

  private async handlePaymentOverdue(event: AsaasWebhookEvent): Promise<void> {
    if (!event.payment) return;

    const payment = await this.paymentRepo.findByProviderPaymentId(event.payment.id);
    if (!payment) return;
    if (payment.status === "RECEIVED" || payment.status === "OVERDUE") return;

    await this.paymentRepo.updateStatus(payment.id, "OVERDUE");

    log.info("Pagamento marcado como vencido", { paymentId: payment.id, asaasPaymentId: event.payment.id });
  }

  private async handlePaymentRefunded(event: AsaasWebhookEvent): Promise<void> {
    if (!event.payment) return;

    const payment = await this.paymentRepo.findByProviderPaymentId(event.payment.id);
    if (!payment) return;
    if (payment.status === "REFUNDED") return;

    await this.paymentRepo.updateStatus(payment.id, "REFUNDED");

    await this.walletService.debit(payment.walletId, payment.amount, "REFUND", {
      reference: "Estorno de depósito via Pix",
      metadata: {
        provider: "ASAAS",
        externalEventId: event.id,
        asaasPaymentId: event.payment.id,
      },
    });

    log.info("Pagamento estornado e saldo debitado", { paymentId: payment.id, asaasPaymentId: event.payment.id });
  }

  private async getUserInfo(userId: string): Promise<{
    fullName: string;
    email: string;
    cpf: string | null;
    cnpj: string | null;
  }> {
    const user = await this.userRepo.findById(userId);
    if (!user) throw APIError.notFound("Usuário não encontrado.");
    return {
      fullName: user.fullName,
      email: user.email,
      cpf: user.cpf,
      cnpj: user.cnpj,
    };
  }
}

export const paymentService = new PaymentService(paymentRepository, walletRepository, walletService, userRepository);
