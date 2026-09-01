import { z } from "zod";

export const WalletIdSchema = z.object({
  walletId: z.string().uuid(),
});

export const ListTransactionsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const DepositSchema = z.object({
  amountInCents: z.number().int().positive("Valor deve ser maior que zero"),
});
