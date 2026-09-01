ALTER TABLE "drivers" ADD COLUMN "cpf" varchar(11);--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "cnpj" varchar(14);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "cpf" varchar(11);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "cnpj" varchar(14);--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "cpf_cnpj";