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

export type AsaasTransferStatus =
  | "PENDING"
  | "IN_BANK_PROCESSING"
  | "DONE"
  | "CANCELLED"
  | "FAILED"
  | "REFUNDED"
  | "BLOCKED"
  | "FORBIDDEN"
  | "DELETED";

export interface AsaasTransfer {
  id: string;
  object: string;
  status: AsaasTransferStatus;
  value: number;
  pixAddressKey: string;
  pixAddressKeyType: string;
  transferDate: string;
  description: string | null;
  externalReference: string | null;
  dateCreated: string;
}

export interface AsaasError {
  errors: Array<{
    code: string;
    description: string;
  }>;
}

export interface CreateAsaasCustomerData {
  name: string;
  cpfCnpj: string;
  email?: string;
  externalReference?: string;
}

export interface CreateAsaasPaymentData {
  customer: string;
  billingType: "PIX";
  value: number;
  dueDate: string;
  description?: string;
  externalReference?: string;
}

export interface CreateAsaasTransferData {
  value: number;
  pixAddressKey: string;
  pixAddressKeyType: string;
  description?: string;
  externalReference?: string;
}
