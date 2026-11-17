import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getEnv } from "@/lib/env";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export function getDb(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const env = getEnv();
    const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
    globalForPrisma.prisma = new PrismaClient({
      adapter,
      log: ["warn", "error"],
    });
  }
  return globalForPrisma.prisma;
}
