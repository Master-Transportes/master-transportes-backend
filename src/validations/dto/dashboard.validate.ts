import { z } from "zod";

export const BanUserSchema = z.object({
  reason: z.string().min(5, "A razão de banimento deve ter pelo menos 5 caracteres."),
});

const PaginationWithSearch = z.object({
  page: z.coerce.number().int().min(0).optional().default(1).transform(v => v || 1),
  limit: z.coerce.number().int().min(0).max(50).optional().default(20).transform(v => v || 10),
  search: z.string().optional().default("").transform(s => s.trim()),
  status: z.enum(["ACTIVE", "BANNED", "INACTIVE"]).optional(),
});

export const ListUsersSchema = PaginationWithSearch.extend({
  role: z.enum(["CLIENT"]).optional().default("CLIENT"),
});

export const ListSystemUsersSchema = PaginationWithSearch;
