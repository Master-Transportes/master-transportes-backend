import { z } from "zod";

export const ClientBaseSchema = z.object({
  role: z.string(),
  status: z.string(),
});

export const DriverBaseSchema = z.object({
  role: z.string(),
  status: z.string(),
});

export const WalletBalanceSchema = z.object({
  balance: z.number(),
  currency: z.string(),
});

const ProfileBaseSchema = z
  .object({
    id: z.string(),
    fullName: z.string(),
    email: z.string(),
    status: z.string(),
  })
  .passthrough();

export const ClientProfileSchema = ProfileBaseSchema;
export const DriverProfileSchema = ProfileBaseSchema;
