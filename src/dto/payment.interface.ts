export interface WalletDepositResponse {
  paymentId: string;
  qrCodeBase64: string;
  pixPayload: string;
  expirationDate: string;
  amountInCents: number;
}

export interface WebhookResponse {
  received: boolean;
}
