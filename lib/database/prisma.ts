import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "@prisma/client";
import { d1Database } from "@/lib/runtime-env";

/**
 * Crea un PrismaClient nuevo para el contexto actual del request.
 *
 * Cloudflare Workers no permite reutilizar objetos de I/O creados por una
 * invocación en otra invocación. El adapter D1 queda ligado al request actual,
 * por lo que NO se debe conservar PrismaClient en globalThis entre requests.
 */
export function getPrismaClient(): PrismaClient {
  const database = d1Database();
  return new PrismaClient({
    adapter: new PrismaD1(database),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}
