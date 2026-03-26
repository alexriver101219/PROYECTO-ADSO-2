import type { AppConfig } from "../config/env";
import { hashPassword } from "./password";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as {
  prisma?: PrismaClient;
};

export function createPrismaClient(databaseUrl?: string) {
  return new PrismaClient(
    databaseUrl
      ? {
          datasources: {
            db: {
              url: databaseUrl,
            },
          },
        }
      : undefined,
  );
}

export const prisma =
  globalForPrisma.prisma ?? createPrismaClient(process.env.DATABASE_URL);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

const bootstrapStatements = [
  `PRAGMA foreign_keys = ON;`,
  `CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL UNIQUE,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK ("role" IN ('USER', 'ADMIN'))
  );`,
  `CREATE TABLE IF NOT EXISTS "Request" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CHECK ("status" IN ('PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED'))
  );`,
  `CREATE TABLE IF NOT EXISTS "StatusHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "changedByUserId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CHECK ("toStatus" IN ('PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED')),
    CHECK ("fromStatus" IS NULL OR "fromStatus" IN ('PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED'))
  );`,
  `CREATE TABLE IF NOT EXISTS "Attachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
  );`,
  `CREATE INDEX IF NOT EXISTS "Request_userId_status_idx" ON "Request"("userId", "status");`,
  `CREATE INDEX IF NOT EXISTS "Request_createdAt_idx" ON "Request"("createdAt");`,
  `CREATE INDEX IF NOT EXISTS "StatusHistory_requestId_createdAt_idx" ON "StatusHistory"("requestId", "createdAt");`,
  `CREATE INDEX IF NOT EXISTS "Attachment_requestId_createdAt_idx" ON "Attachment"("requestId", "createdAt");`,
];

export async function initializeDatabase(client: PrismaClient) {
  for (const statement of bootstrapStatements) {
    await client.$executeRawUnsafe(statement);
  }
}

export async function ensureDefaultAdmin(
  client: PrismaClient,
  config: Pick<AppConfig, "adminEmail" | "adminPassword">,
) {
  const email = config.adminEmail.toLowerCase();
  const passwordHash = await hashPassword(config.adminPassword);

  await client.user.upsert({
    where: { email },
    update: {
      name: "Administrator",
      role: "ADMIN",
      passwordHash,
    },
    create: {
      name: "Administrator",
      email,
      role: "ADMIN",
      passwordHash,
    },
  });
}
