import { hash } from "bcrypt";
import { eq } from "drizzle-orm";
import { db } from "@/infra/db/drizzle";
import { users, drivers } from "@/infra/db/schema";

const seedData = [
  { fullName: "Enderson User da Silva", email: "user@admin.com", role: "CLIENT" as const },
  { fullName: "Enderson Admin da Silva", email: "admin@admin.com", role: "ADMIN" as const },
  { fullName: "Enderson Driver da Silva", email: "driver1@admin.com", role: "DRIVER" as const },
  { fullName: "Enderson Driver2 da Silva", email: "driver2@admin.com", role: "DRIVER" as const },
];

async function seedUsers(): Promise<void> {
  const password = await hash("admin123", 10);

  for (const user of seedData) {
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, user.email));

    if (existing) {
      await db.update(users).set({ password, updatedAt: new Date() }).where(eq(users.email, user.email));
      console.log(`Updated password for ${user.email}`);
    } else {
      const [created] = await db.insert(users).values({
        fullName: user.fullName,
        email: user.email,
        password,
        role: user.role,
      }).returning({ id: users.id });

      if (user.role === "DRIVER") {
        await db.insert(drivers).values({ userId: created.id });
      }

      console.log(`Created user ${user.email}`);
    }
  }
}

seedUsers().finally(() => process.exit());
