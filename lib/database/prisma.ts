import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "@prisma/client";
import { d1Database } from "@/lib/runtime-env";

type PrismaGlobal = { prisma?: PrismaClient; prismaBinding?: D1Database };
const globalForPrisma = globalThis as unknown as PrismaGlobal;

/**
 * Prisma se conecta exclusivamente al binding D1 `DB` del Worker.
 * No utiliza cadenas de conexión ni Hyperdrive.
 */
export function getPrismaClient(): PrismaClient {
  const database = d1Database();
  if (globalForPrisma.prisma && globalForPrisma.prismaBinding === database) {
    return globalForPrisma.prisma;
  }

  const client = new PrismaClient({
    adapter: new PrismaD1(database),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

  globalForPrisma.prisma = client;
  globalForPrisma.prismaBinding = database;
  return client;
}
