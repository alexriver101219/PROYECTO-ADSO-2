import "dotenv/config";

import { PrismaClient, Role } from "@prisma/client";

import { hashPassword } from "../src/lib/password";
import { initializeDatabase } from "../src/lib/prisma";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "admin@example.com").toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "Admin123!";

  await initializeDatabase(prisma);

  await prisma.user.upsert({
    where: { email },
    update: {
      name: "Administrator",
      role: Role.ADMIN,
      passwordHash: await hashPassword(password),
    },
    create: {
      name: "Administrator",
      email,
      role: Role.ADMIN,
      passwordHash: await hashPassword(password),
    },
  });

  console.log(`Admin ready: ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
