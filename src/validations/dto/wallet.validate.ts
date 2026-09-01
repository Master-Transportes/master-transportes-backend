import { z } from "zod";
import { MIN_PAYOUT_AMOUNT_CENTS } from "@/constants/wallet";

export const ListTransactionsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const DepositSchema = z.object({
  amountInCents: z.number().int().positive("Valor deve ser maior que zero"),
});

export const PayoutSchema = z.object({
  amountInCents: z
    .number()
    .int()
    .positive("Valor deve ser maior que zero")
    .min(MIN_PAYOUT_AMOUNT_CENTS, `Valor mínimo para saque é R$ ${MIN_PAYOUT_AMOUNT_CENTS / 100},00`),
});
