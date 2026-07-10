import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

function createPrismaClient() {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  // Single source of truth: local dev and production both connect directly to
  // Turso. (Embedded replicas fail on Windows — atomic-rename access error — so
  // we keep it simple and consistent.) On Vercel this is fast because the
  // functions run in the same region as the database (see vercel.json).
  if (tursoUrl && authToken) {
    return new PrismaClient({
      adapter: new PrismaLibSql({ url: tursoUrl, authToken }),
    } as ConstructorParameters<typeof PrismaClient>[0]);
  }

  // No Turso configured → plain local SQLite file (offline dev).
  return new PrismaClient({
    adapter: new PrismaLibSql({ url: "file:./prisma/dev.db" }),
  } as ConstructorParameters<typeof PrismaClient>[0]);
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
export const prisma = globalForPrisma.prisma || createPrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
