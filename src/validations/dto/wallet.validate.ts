import { z } from "zod";

export const WalletIdSchema = z.object({
  walletId: z.string().uuid(),
});
