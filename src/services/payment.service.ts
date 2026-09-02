import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import type { IPaymentRepository } from "@/repositories/contracts/IPaymentRepository";
import type { IWalletRepository } from "@/repositories/contracts/IWalletRepository";
import type { IWalletTransactionRepository } from "@/repositories/contracts/IWalletTransactionRepository";
import type { IClientRepository } from "@/repositories/contracts/IClientRepository";
import type { IDriverRepository } from "@/repositories/contracts/IDriverRepository";
import type { WalletDepositResponse } from "@/dto/payment.interface";
import type { PayoutResponse } from "@/dto/wallet.interface";
import {
  paymentRepository,
  walletRepository,
  walletTransactionRepository,
  clientRepository,
  driverRepository,
} from "@/repositories";
import { asaasClient, type IAsaasClient } from "@/integrations/asaas/asaas.client";
import type { AsaasWebhookEvent } from "@/integrations/asaas/asaas.webhook-types";
import type { WalletService } from "./wallet.service";
import { walletService } from "./wallet.service";
import { ASAAS_WEBHOOK_EVENTS } from "@/constants/asaas";
import { validateOrThrow } from "@/validations/schema-validator";
import { DepositSchema, PayoutSchema } from "@/validations/dto/wallet.validate";
import { isValidCpf, isValidCnpj } from "@/utils/document";
import { isPgUniqueViolation } from "@/utils/database";

export class PaymentService {
  constructor(
    private readonly paymentRepo: IPaymentRepository,
    private readonly walletRepo: IWalletRepository,
    private readonly walletTxRepo: IWalletTransactionRepository,
    private readonly walletService: WalletService,
    private readonly clientRepo: IClientRepository,
    private readonly driverRepo: IDriverRepository,
    private readonly asaas: IAsaasClient,
  ) {}

  async createDeposit(userId: string, amountInCents: number): Promise<WalletDepositResponse> {
    const { amountInCents: validatedAmount } = validateOrThrow(DepositSchema, { amountInCents });

    let wallet = await this.walletRepo.findByOwner(userId, "USER");
    if (!wallet) {
      wallet = await this.walletRepo.create(userId, "USER");
    }

    if (wallet.status !== "ACTIVE") {
      throw APIError.failedPrecondition("Carteira não está ativa.");
    }

    const user = await this.getUserInfo(userId);

    let asaasCustomer = await this.asaas.findCustomerByExternalReference(userId);

    if (!asaasCustomer) {
      const cpfCnpj = user.cpf ?? user.cnpj ?? "";
      if (cpfCnpj && !isValidCpf(cpfCnpj) && !isValidCnpj(cpfCnpj)) {
        throw APIError.failedPrecondition("CPF/CNPJ do usuário é inválido.");
      }

      asaasCustomer = await this.asaas.createCustomer({
        name: user.fullName,
        cpfCnpj,
        email: user.email,
        externalReference: userId,
      });
    }

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 1);

    const payment = await this.asaas.createPayment({
      customer: asaasCustomer.id,
      billingType: "PIX",
      value: Number((validatedAmount / 100).toFixed(2)),
      dueDate: dueDate.toISOString().split("T")[0],
      description: `Depósito na carteira - ${user.fullName}`,
      externalReference: `dep_${wallet.id}_${Date.now()}`,
    });

    const dbPayment = await this.paymentRepo.create({
      walletId: wallet.id,
      customerId: userId,
      amount: validatedAmount,
      providerPaymentId: payment.id,
      description: "Depósito via Pix",
    });

    const qrCode = await this.asaas.getPixQrCode(payment.id);

    return {
      paymentId: dbPayment.id,
      qrCodeBase64: qrCode.encodedImage,
      pixPayload: qrCode.payload,
      expirationDate: qrCode.expirationDate,
      amountInCents: validatedAmount,
    };
  }

  async requestPayout(driverId: string, amountInCents: number): Promise<PayoutResponse> {
    const { amountInCents: validatedAmount } = validateOrThrow(PayoutSchema, { amountInCents });

    const pix = await this.driverRepo.findByIdWithPixKey(driverId);
    if (!pix) throw APIError.notFound("Motorista não encontrado.");
    if (!pix.pixKey || !pix.pixKeyType) {
      throw APIError.failedPrecondition("Cadastre uma chave Pix antes de solicitar o saque.");
    }

    let wallet = await this.walletRepo.findByOwner(driverId, "DRIVER");
    if (!wallet) {
      wallet = await this.walletRepo.create(driverId, "DRIVER");
    }
    if (wallet.status !== "ACTIVE") {
      throw APIError.failedPrecondition("Carteira não está ativa.");
    }

    const txEntry = await this.walletRepo.debit(wallet.id, {
      type: "PAYOUT",
      direction: "DEBIT",
      amount: validatedAmount,
      status: "PENDING",
      reference: "Saque via Pix",
    });

    let transfer;
    try {
      transfer = await this.asaas.createTransfer({
        value: Number((validatedAmount / 100).toFixed(2)),
        pixAddressKey: pix.pixKey,
        pixAddressKeyType: pix.pixKeyType,
        description: "Saque via Pix",
        externalReference: txEntry.id,
      });

      await this.walletRepo.attachTransferReference(txEntry.id, transfer.id);
      await this.walletRepo.completePendingTransaction(txEntry.id);
    } catch (error: unknown) {
      await this.walletRepo.reverseTransaction(txEntry.id);
      await this.walletService.invalidateCache(wallet.id);
      log.error({ error, driverId }, "Falha ao criar transferência Pix no Asaas");
      throw APIError.internal("Não foi possível processar o saque no momento. Tente novamente.");
    }

    await this.walletService.invalidateCache(wallet.id);

    const updatedWallet = await this.walletRepo.findById(wallet.id);

    return {
      transactionId: txEntry.id,
      amountInCents: validatedAmount,
      newBalance: updatedWallet!.balance,
    };
  }

  async processWebhook(rawBody: unknown): Promise<void> {
    const event = rawBody as AsaasWebhookEvent;

    try {
      const existing = await this.paymentRepo.findWebhookEventByExternalId(event.id);
      if (existing?.processedAt) return;

      if (!existing) {
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
        case ASAAS_WEBHOOK_EVENTS.TRANSFER_DONE:
          await this.handleTransferSettled(event, "COMPLETED");
          break;
        case ASAAS_WEBHOOK_EVENTS.TRANSFER_FAILED:
        case ASAAS_WEBHOOK_EVENTS.TRANSFER_CANCELLED:
        case ASAAS_WEBHOOK_EVENTS.TRANSFER_REFUNDED:
          await this.handleTransferSettled(event, "REVERSED");
          break;
        case ASAAS_WEBHOOK_EVENTS.PAYMENT_CREATED:
        case ASAAS_WEBHOOK_EVENTS.PAYMENT_CONFIRMED:
        case ASAAS_WEBHOOK_EVENTS.PAYMENT_UPDATED:
          log.info("Evento Asaas registrado (sem ação)", { eventId: event.id, eventType: event.event });
          break;
        default:
          log.warn("Evento Asaas não tratado", { eventId: event.id, eventType: event.event });
      }

      await this.paymentRepo.markWebhookProcessed(event.id);
    } catch (error) {
      if (error && !isPgUniqueViolation(error)) {
        await this.paymentRepo.deleteWebhookEvent(event.id).catch(() => undefined);
      }
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

    await this.paymentRepo.refundPayment(payment.id, payment.walletId, payment.amount, {
      provider: "ASAAS",
      externalEventId: event.id,
      asaasPaymentId: event.payment.id,
    });

    await this.walletService.invalidateCache(payment.walletId);

    log.info("Pagamento estornado e saldo debitado", { paymentId: payment.id, asaasPaymentId: event.payment.id });
  }

  private async handleTransferSettled(event: AsaasWebhookEvent, targetStatus: "COMPLETED" | "REVERSED"): Promise<void> {
    if (!event.transfer) return;

    const tx = await this.walletTxRepo.findByAsaasTransferId(event.transfer.id);
    if (!tx) return;

    if (targetStatus === "COMPLETED") {
      await this.walletRepo.completePendingTransaction(tx.id);
    } else {
      await this.walletRepo.reverseTransaction(tx.id);
    }

    await this.walletService.invalidateCache(tx.walletId);

    log.info("Transferência Asaas conciliada", {
      transferId: event.transfer.id,
      transactionId: tx.id,
      status: targetStatus,
    });
  }

  private async getUserInfo(userId: string): Promise<{
    fullName: string;
    email: string;
    cpf: string | null;
    cnpj: string | null;
  }> {
    const user = await this.clientRepo.findById(userId);
    if (!user) throw APIError.notFound("Usuário não encontrado.");
    return {
      fullName: user.fullName,
      email: user.email,
      cpf: user.cpf,
      cnpj: user.cnpj,
    };
  }
}

export const paymentService = new PaymentService(
  paymentRepository,
  walletRepository,
  walletTransactionRepository,
  walletService,
  clientRepository,
  driverRepository,
  asaasClient,
);
