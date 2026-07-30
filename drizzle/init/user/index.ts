import { hash } from "bcrypt";
import { eq } from "drizzle-orm";
import { db } from "@/infra/drizzle/drizzle";
import { users, drivers, driverCredentials } from "@/infra/drizzle/schema";

const userSeedData = [
  { fullName: "Enderson User da Silva", email: "user@admin.com", role: "CLIENT" as const },
  { fullName: "Enderson Admin da Silva", email: "admin@admin.com", role: "ADMIN" as const },
];

const driverSeedData = [
  { fullName: "Enderson Driver da Silva", email: "driver@admin.com" },
  { fullName: "Enderson Driver1 da Silva", email: "driver2@admin.com" },
];

async function seedUsers(): Promise<void> {
  const password = await hash("admin123", 10);

  for (const user of userSeedData) {
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, user.email));

    if (existing) {
      await db.update(users).set({ password, updatedAt: new Date() }).where(eq(users.email, user.email));
      console.log(`Updated password for ${user.email}`);
    } else {
      await db.insert(users).values({
        fullName: user.fullName,
        email: user.email,
        password,
        role: user.role,
      });
      console.log(`Created user ${user.email}`);
    }
  }

  for (const driver of driverSeedData) {
    const [existingCred] = await db
      .select({ id: driverCredentials.id })
      .from(driverCredentials)
      .where(eq(driverCredentials.email, driver.email));

    if (existingCred) {
      await db
        .update(driverCredentials)
        .set({ password, updatedAt: new Date() })
        .where(eq(driverCredentials.email, driver.email));
      console.log(`Updated password for driver ${driver.email}`);
    } else {
      const [newDriver] = await db.insert(drivers).values({ fullName: driver.fullName }).returning({ id: drivers.id });

      await db.insert(driverCredentials).values({
        driverId: newDriver.id,
        email: driver.email,
        password,
      });
      console.log(`Created driver ${driver.email}`);
    }
  }
}

seedUsers().finally(() => process.exit());
