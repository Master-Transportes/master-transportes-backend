export interface AsaasCustomer {
  id: string;
  object: string;
  dateCreated: string;
  name: string;
  email: string;
  cpfCnpj: string;
  personType: string;
  externalReference: string;
  notificationDisabled: boolean;
  deleted: boolean;
}

export interface AsaasPayment {
  id: string;
  object: string;
  dateCreated: string;
  customer: string;
  status: string;
  value: number;
  netValue: number;
  billingType: string;
  description: string;
  externalReference: string;
  dueDate: string;
  originalDueDate: string;
  paymentDate: string | null;
  confirmedDate: string | null;
  invoiceUrl: string;
  invoiceNumber: string;
  canBePaidAfterDueDate: boolean;
  deleted: boolean;
  anticipated: boolean;
  anticipable: boolean;
  split: unknown[];
}

export interface AsaasPixQrCode {
  encodedImage: string;
  payload: string;
  expirationDate: string;
  description: string;
}

export interface AsaasPaymentStatus {
  status: string;
}

export interface AsaasWebhookEvent {
  id: string;
  event: string;
  dateCreated: string;
  account: {
    id: string;
  };
  payment: AsaasPayment;
}

export interface AsaasError {
  errors: Array<{
    code: string;
    description: string;
  }>;
}
