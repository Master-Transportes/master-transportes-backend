export interface AsaasWebhookDiscount {
  value: number;
  dueDateLimitDays: number;
  limitDate: string | null;
  type: string;
}

export interface AsaasWebhookFine {
  value: number;
  type: string;
}

export interface AsaasWebhookInterest {
  value: number;
  type: string;
}

export interface AsaasWebhookCreditCard {
  creditCardNumber: string;
  creditCardBrand: string;
  creditCardToken: string;
}

export interface AsaasWebhookSplit {
  id: string;
  walletId: string;
  fixedValue?: number;
  percentualValue?: number;
  status: string;
  refusalReason: string | null;
  externalReference: string | null;
  description: string | null;
}

export interface AsaasWebhookChargeback {
  status: string;
  reason: string;
}

export interface AsaasWebhookPayment {
  object: string;
  id: string;
  dateCreated: string;
  customer: string;
  dueDate: string;
  originalDueDate: string;
  value: number;
  netValue: number;
  description: string;
  externalReference: string;
  billingType: string;
  status: string;
  invoiceUrl: string;
  invoiceNumber: string;
  deleted: boolean;
  anticipated: boolean;
  anticipable: boolean;
  postalService: boolean;
  discount: AsaasWebhookDiscount;
  fine: AsaasWebhookFine;
  interest: AsaasWebhookInterest;

  subscription?: string | null;
  installment?: string | null;
  checkoutSession?: string | null;
  paymentLink?: string | null;
  originalValue?: number | null;
  interestValue?: number | null;
  nossoNumero?: string | null;
  pixTransaction?: string | null;
  pixQrCodeId?: string | null;
  confirmedDate?: string | null;
  paymentDate?: string | null;
  clientPaymentDate?: string | null;
  installmentNumber?: number | null;
  creditDate?: string | null;
  custody?: string | null;
  estimatedCreditDate?: string | null;
  bankSlipUrl?: string | null;
  transactionReceiptUrl?: string | null;
  lastInvoiceViewedDate?: string | null;
  lastBankSlipViewedDate?: string | null;
  creditCard?: AsaasWebhookCreditCard | null;
  split?: AsaasWebhookSplit[] | null;
  chargeback?: AsaasWebhookChargeback | null;
  refunds?: unknown[] | null;
  escrow?: unknown | null;
}

export interface AsaasWebhookAccount {
  id: string;
  ownerId: string | null;
}

export interface AsaasWebhookEvent {
  id: string;
  event: string;
  dateCreated: string;
  account: AsaasWebhookAccount;
  payment: AsaasWebhookPayment;
}
