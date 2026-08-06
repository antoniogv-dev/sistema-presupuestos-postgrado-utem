import type { AccessLevel } from "@prisma/client";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { ZodError } from "zod";
import { d1Id, runD1Batch } from "@/lib/database/d1-atomic";
import { getPrismaClient } from "@/lib/database/prisma";
import { d1Database, runtimeValue } from "@/lib/runtime-env";

export interface ApiIdentity {
  userId: string;
  email: string;
  name: string;
  roles: AccessLevel[];
  source: "CLOUDFLARE_ACCESS" | "INTERNAL_SERVICE";
}

const accessKeySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function uniqueRoles(values: AccessLevel[]): AccessLevel[] {
  return [...new Set(values)];
}

export function hasAccess(identity: ApiIdentity, role: AccessLevel): boolean {
  return identity.roles.includes(role);
}

function normalizedTeamDomain(): string {
  return (runtimeValue("CLOUDFLARE_ACCESS_TEAM_DOMAIN") ?? "").replace(/\/$/, "");
}

async function verifiedAccessEmail(request: Request): Promise<string | null> {
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) return null;
  const teamDomain = normalizedTeamDomain();
  const audience = runtimeValue("CLOUDFLARE_ACCESS_AUD");
  if (!teamDomain || !audience) throw new Error("ACCESS_NOT_CONFIGURED");

  let keySet = accessKeySets.get(teamDomain);
  if (!keySet) {
    keySet = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
    accessKeySets.set(teamDomain, keySet);
  }

  try {
    const { payload } = await jwtVerify(token, keySet, { issuer: teamDomain, audience });
    return typeof payload.email === "string" ? payload.email.trim().toLowerCase() : null;
  } catch {
    throw new Error("INVALID_ACCESS_TOKEN");
  }
}

async function bootstrapAdministrator(email: string) {
  const configured = runtimeValue("BOOTSTRAP_ADMIN_EMAIL")?.toLowerCase();
  if (!configured || configured !== email) return null;

  const prisma = getPrismaClient();
  const roles = await prisma.role.findMany({
    where: { accessLevel: { in: ["GESTOR", "VISTO_BUENO", "APROBADOR"] } },
  });
  if (roles.length !== 3) throw new Error("DATABASE_NOT_INITIALIZED");

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  const userId = existing?.id ?? d1Id("user");
  const database = d1Database();
  const statements: D1PreparedStatement[] = [
    database.prepare(`
      INSERT INTO "User" ("id", "email", "name", "active", "createdAt", "updatedAt")
      VALUES (?, ?, 'Administrador inicial', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT("email") DO UPDATE SET
        "active" = 1,
        "updatedAt" = CURRENT_TIMESTAMP
    `).bind(userId, email),
  ];
  for (const role of roles) {
    statements.push(
      database.prepare(`INSERT OR IGNORE INTO "UserRole" ("userId", "roleId") VALUES (?, ?)`).bind(userId, role.id),
    );
  }
  await runD1Batch(statements);

  return prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: true } } },
  });
}

/**
 * La identidad siempre proviene de Cloudflare Access o de una clave de servicio.
 * El primer administrador puede aprovisionarse una vez mediante BOOTSTRAP_ADMIN_EMAIL.
 */
export async function requireApiIdentity(request: Request): Promise<ApiIdentity> {
  const prisma = getPrismaClient();
  const accessEmail = await verifiedAccessEmail(request);
  const configuredKey = runtimeValue("INTERNAL_API_KEY");
  const bearer = request.headers.get("authorization");
  const serviceAuthorized = Boolean(configuredKey && bearer === `Bearer ${configuredKey}`);

  let user = accessEmail
    ? await prisma.user.findUnique({
      where: { email: accessEmail },
      include: { roles: { include: { role: true } } },
    })
    : serviceAuthorized
      ? await prisma.user.findUnique({
        where: { id: request.headers.get("x-user-id") ?? "" },
        include: { roles: { include: { role: true } } },
      })
      : null;

  if (!accessEmail && !serviceAuthorized) throw new Error("UNAUTHORIZED");
  if (!user && accessEmail) user = await bootstrapAdministrator(accessEmail);
  if (!user || !user.active) throw new Error("INVALID_IDENTITY");

  const roles = uniqueRoles(user.roles.map((assignment) => assignment.role.accessLevel));
  if (!roles.length) throw new Error("INVALID_IDENTITY");

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    roles,
    source: accessEmail ? "CLOUDFLARE_ACCESS" : "INTERNAL_SERVICE",
  };
}

export function apiError(error: unknown): Response {
  if (error instanceof ZodError) return Response.json({ error: "Datos inválidos.", issues: error.issues }, { status: 400 });
  const message = error instanceof Error ? error.message : "UNKNOWN";
  if (message === "UNAUTHORIZED") return Response.json({ error: "No autorizado." }, { status: 401 });
  if (message === "ACCESS_NOT_CONFIGURED") return Response.json({ error: "Cloudflare Access no está configurado completamente." }, { status: 503 });
  if (message === "DATABASE_NOT_CONFIGURED") return Response.json({ error: "El binding D1 DB no está configurado." }, { status: 503 });
  if (message === "DATABASE_NOT_INITIALIZED") return Response.json({ error: "D1 existe, pero aún no se ha ejecutado la migración y carga inicial." }, { status: 503 });
  if (message === "INVALID_ACCESS_TOKEN") return Response.json({ error: "La sesión de Cloudflare Access no es válida." }, { status: 401 });
  if (message === "INVALID_IDENTITY") return Response.json({ error: "El usuario no está habilitado o no posee un nivel de acceso." }, { status: 403 });
  if (message === "FORBIDDEN") return Response.json({ error: "El nivel de acceso no permite esta operación." }, { status: 403 });
  if (message === "NOT_FOUND") return Response.json({ error: "Registro no encontrado." }, { status: 404 });
  if (message === "INVALID_STAGE") return Response.json({ error: "La operación no corresponde a la etapa actual." }, { status: 409 });
  console.error(error);
  return Response.json({ error: "Error interno." }, { status: 500 });
}
