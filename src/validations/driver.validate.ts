import { z } from "zod";
import { cpfSchema, phoneSchema } from "./identity.schema";
import { passwordCreationSchema } from "./password.schema";

/**
 * Cadastro público de motorista. CPF e telefone são obrigatórios nesta etapa.
 * Papéis, status de conta e aprovação nunca são aceitos no payload.
 */
export const DriverRegisterSchema = z.strictObject({
  fullName: z.string().trim().min(2, "Nome completo é obrigatório.").max(150, "Nome completo é muito longo."),
  email: z.string().trim().toLowerCase().max(254, "E-mail inválido.").email("E-mail inválido."),
  password: passwordCreationSchema,
  phone: phoneSchema,
  cpf: cpfSchema,
});

/**
 * Aplicação de papel DRIVER a uma identidade CLIENT autenticada.
 * Só os dados que o perfil de motorista exige são aceitos; identidade, papel,
 * status de aprovação e e-mail nunca vêm do payload.
 */
export const DriverApplySchema = z.strictObject({ phone: phoneSchema, cpf: cpfSchema });

/**
 * Disponibilidade operacional. O payload só declara a intenção do motorista:
 * aprovação cadastral, corrida ativa e presença recente são verificadas no
 * backend e nunca são aceitas daqui.
 */
export const DriverAvailabilitySchema = z.strictObject({
  available: z.boolean("Disponibilidade deve ser um valor booleano."),
});
