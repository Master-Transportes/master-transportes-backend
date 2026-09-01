import { hash } from "bcrypt";
import { eq } from "drizzle-orm";
import { db } from "@/infra/database/drizzle";
import { users, drivers } from "@/infra/database/schema";

// ---------- DADOS DE EXEMPLO ----------
const userSeedData = [
  { fullName: "Enderson User da Silva", email: "user@admin.com", cpf: "52998224725", role: "CLIENT" as const },
  { fullName: "Enderson Admin da Silva", email: "admin@admin.com", cpf: "12345678909", role: "ADMIN" as const },
];

const driverSeedData = [
  { fullName: "Enderson Driver da Silva", email: "driver@admin.com", cpf: "48326754005" },
  { fullName: "Enderson Driver1 da Silva", email: "driver2@admin.com", cpf: "71406852317" },
];

// ---------- FUNÇÃO PRINCIPAL ----------
async function seed(): Promise<void> {
  const userPassword = await hash("admin123", 10);
  const driverPassword = await hash("admin123", 10);

  // 1. Semear usuários (clientes/admins)
  for (const user of userSeedData) {
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, user.email));

    if (existing) {
      await db.update(users).set({ password: userPassword, updatedAt: new Date() }).where(eq(users.email, user.email));
      console.log(`🔐 Senha atualizada para ${user.email}`);
    } else {
      await db.insert(users).values({
        fullName: user.fullName,
        email: user.email,
        cpf: user.cpf,
        password: userPassword,
        role: user.role,
        status: "ACTIVE",
      });
      console.log(`✅ Usuário criado: ${user.email}`);
    }
  }

  // 2. Semear motoristas (tabela independente)
  for (const driver of driverSeedData) {
    const [existing] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.email, driver.email));

    if (existing) {
      await db
        .update(drivers)
        .set({ password: driverPassword, updatedAt: new Date() })
        .where(eq(drivers.email, driver.email));
      console.log(`🔐 Senha atualizada para motorista ${driver.email}`);
    } else {
      await db.insert(drivers).values({
        fullName: driver.fullName,
        email: driver.email,
        cpf: driver.cpf,
        password: driverPassword,
        status: "APPROVED", // ou "PENDING", como preferir
      });
      console.log(`✅ Motorista criado: ${driver.email}`);
    }
  }

  console.log("🌱 Seed concluído.");
}

seed()
  .catch(console.error)
  .finally(() => process.exit());
