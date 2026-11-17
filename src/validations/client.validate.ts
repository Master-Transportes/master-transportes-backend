import { z } from "zod";
import { cpfSchema, phoneSchema } from "./identity.schema";
import { passwordCreationSchema } from "./password.schema";

/**
 * Cadastro público de passageiro. Campos desconhecidos (status, roles, etc.)
 * são rejeitados pelo strictObject.
 */
export const ClientRegisterSchema = z.strictObject({
  fullName: z.string().trim().min(2, "Nome completo é obrigatório.").max(150, "Nome completo é muito longo."),
  email: z.string().trim().toLowerCase().max(254, "E-mail inválido.").email("E-mail inválido."),
  password: passwordCreationSchema,
  phone: phoneSchema.optional(),
  cpf: cpfSchema.optional(),
});
