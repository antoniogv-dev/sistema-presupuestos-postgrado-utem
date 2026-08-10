import { createRemoteJWKSet, jwtVerify } from "jose";
import { ZodError } from "zod";
import { d1Id, runD1Batch } from "@/lib/database/d1-atomic";
import { getPrismaClient } from "@/lib/database/prisma";
import { hashPassword, hashSessionToken } from "@/lib/auth/password";
import { d1Database, runtimeValue } from "@/lib/runtime-env";

export type AppRole = "ADMIN" | "CREADOR" | "LECTOR" | "GESTOR" | "VISTO_BUENO" | "APROBADOR";

export interface ApiIdentity {
  userId: string;
  email: string;
  name: string;
  roles: AppRole[];
  source: "CLOUDFLARE_ACCESS" | "INTERNAL_SESSION" | "INTERNAL_SERVICE";
}

const accessKeySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
const SESSION_COOKIE = "utem_budget_session";

function isAppRole(value: string): value is AppRole {
  return ["ADMIN", "CREADOR", "LECTOR", "GESTOR", "VISTO_BUENO", "APROBADOR"].includes(value);
}

function uniqueRoles(values: string[]): AppRole[] {
  return [...new Set(values.filter(isAppRole))];
}

export function hasAccess(identity: ApiIdentity, role: AppRole): boolean {
  return identity.roles.includes("ADMIN") || identity.roles.includes(role);
}

export function hasAnyAccess(identity: ApiIdentity, roles: AppRole[]): boolean {
  return identity.roles.includes("ADMIN") || roles.some((role) => identity.roles.includes(role));
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

function cookieValue(request: Request, name: string): string | null {
  const cookies = request.headers.get("cookie");
  if (!cookies) return null;
  for (const pair of cookies.split(";")) {
    const [key, ...parts] = pair.trim().split("=");
    if (key === name) return decodeURIComponent(parts.join("="));
  }
  return null;
}

async function sessionUser(request: Request) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await hashSessionToken(token);
  const session = await getPrismaClient().userSession.findUnique({
    where: { tokenHash },
    include: { user: { include: { roles: { include: { role: true } } } } },
  });
  if (!session || session.expiresAt.getTime() <= Date.now() || !session.user.active) return null;
  return session.user;
}

export async function ensureBootstrapAdministrator(email: string) {
  const configured = runtimeValue("BOOTSTRAP_ADMIN_EMAIL")?.trim().toLowerCase();
  if (!configured || configured !== email) return null;

  const prisma = getPrismaClient();
  const roles = await prisma.role.findMany({
    where: { code: { in: ["ADMIN", "GESTOR", "VISTO_BUENO", "APROBADOR"] } },
  });
  if (roles.length < 4) throw new Error("DATABASE_NOT_INITIALIZED");

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, passwordHash: true } });
  const userId = existing?.id ?? d1Id("user");
  const database = d1Database();
  const statements: D1PreparedStatement[] = [];
  const configuredPassword = runtimeValue("BOOTSTRAP_ADMIN_PASSWORD");
  let passwordFields: { hash: string; salt: string; iterations: number } | null = null;
  if (configuredPassword && !existing?.passwordHash) passwordFields = await hashPassword(configuredPassword);

  if (passwordFields) {
    statements.push(database.prepare(`
      INSERT INTO "User" (
        "id", "email", "name", "active", "passwordHash", "passwordSalt", "passwordIterations",
        "passwordUpdatedAt", "createdAt", "updatedAt"
      ) VALUES (?, ?, 'Antonio Gutiérrez', 1, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT("email") DO UPDATE SET
        "name" = 'Antonio Gutiérrez', "active" = 1,
        "passwordHash" = excluded."passwordHash", "passwordSalt" = excluded."passwordSalt",
        "passwordIterations" = excluded."passwordIterations", "passwordUpdatedAt" = CURRENT_TIMESTAMP,
        "updatedAt" = CURRENT_TIMESTAMP
    `).bind(userId, email, passwordFields.hash, passwordFields.salt, passwordFields.iterations));
  } else {
    statements.push(database.prepare(`
      INSERT INTO "User" ("id", "email", "name", "active", "createdAt", "updatedAt")
      VALUES (?, ?, 'Antonio Gutiérrez', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT("email") DO UPDATE SET "name" = 'Antonio Gutiérrez', "active" = 1, "updatedAt" = CURRENT_TIMESTAMP
    `).bind(userId, email));
  }

  for (const role of roles) {
    statements.push(database.prepare(`INSERT OR IGNORE INTO "UserRole" ("userId", "roleId") VALUES (?, ?)`).bind(userId, role.id));
  }
  await runD1Batch(statements);

  return prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: true } } },
  });
}

/**
 * La identidad puede provenir de Cloudflare Access, de una sesión interna segura o de una clave de servicio.
 * El administrador inicial se aprovisiona mediante BOOTSTRAP_ADMIN_EMAIL y, opcionalmente,
 * BOOTSTRAP_ADMIN_PASSWORD para habilitar el inicio de sesión interno.
 */
export async function requireApiIdentity(request: Request): Promise<ApiIdentity> {
  const prisma = getPrismaClient();
  const accessEmail = await verifiedAccessEmail(request);
  const configuredKey = runtimeValue("INTERNAL_API_KEY");
  const bearer = request.headers.get("authorization");
  const serviceAuthorized = Boolean(configuredKey && bearer === `Bearer ${configuredKey}`);

  let source: ApiIdentity["source"] = "INTERNAL_SESSION";
  let user = accessEmail
    ? await prisma.user.findUnique({
      where: { email: accessEmail },
      include: { roles: { include: { role: true } } },
    })
    : null;

  if (accessEmail) {
    source = "CLOUDFLARE_ACCESS";
    const bootstrapEmail = runtimeValue("BOOTSTRAP_ADMIN_EMAIL")?.trim().toLowerCase();
    const needsBootstrapRefresh = bootstrapEmail === accessEmail && (
      !user ||
      user.name !== "Antonio Gutiérrez" ||
      !user.active ||
      !user.roles.some((assignment) => assignment.role.code === "ADMIN")
    );
    if (needsBootstrapRefresh) user = await ensureBootstrapAdministrator(accessEmail);
  }

  if (!user) {
    user = await sessionUser(request);
    if (user) source = "INTERNAL_SESSION";
  }

  if (!user && serviceAuthorized) {
    user = await prisma.user.findUnique({
      where: { id: request.headers.get("x-user-id") ?? "" },
      include: { roles: { include: { role: true } } },
    });
    source = "INTERNAL_SERVICE";
  }

  if (!accessEmail && !user && !serviceAuthorized) throw new Error("UNAUTHORIZED");
  if (!user || !user.active) throw new Error("INVALID_IDENTITY");

  const roles = uniqueRoles(user.roles.map((assignment) => assignment.role.code));
  if (!roles.length) throw new Error("INVALID_IDENTITY");

  return { userId: user.id, email: user.email, name: user.name, roles, source };
}

export function apiError(error: unknown): Response {
  if (error instanceof ZodError) return Response.json({ error: "Datos inválidos.", issues: error.issues }, { status: 400 });
  const message = error instanceof Error ? error.message : "UNKNOWN";
  if (message === "UNAUTHORIZED") return Response.json({ error: "No autorizado." }, { status: 401 });
  if (message === "ACCESS_NOT_CONFIGURED") return Response.json({ error: "Cloudflare Access no está configurado completamente." }, { status: 503 });
  if (message === "DATABASE_NOT_CONFIGURED") return Response.json({ error: "El binding D1 DB no está configurado." }, { status: 503 });
  if (message === "DATABASE_NOT_INITIALIZED") return Response.json({ error: "D1 existe, pero aún no se han ejecutado todas las migraciones." }, { status: 503 });
  if (message === "INVALID_ACCESS_TOKEN") return Response.json({ error: "La sesión de Cloudflare Access no es válida." }, { status: 401 });
  if (message === "INVALID_IDENTITY") return Response.json({ error: "El usuario no está habilitado o no posee un rol de acceso." }, { status: 403 });
  if (message === "FORBIDDEN") return Response.json({ error: "El rol de acceso no permite esta operación." }, { status: 403 });
  if (message === "NOT_FOUND") return Response.json({ error: "Registro no encontrado." }, { status: 404 });
  if (message === "CONFLICT") return Response.json({ error: "El registro entra en conflicto con información existente." }, { status: 409 });
  if (message === "INVALID_STAGE") return Response.json({ error: "La operación no corresponde a la etapa actual." }, { status: 409 });

  const normalized = message.toLowerCase();
  if (
    normalized.includes("no such table") ||
    normalized.includes("no such column") ||
    normalized.includes("has no column named")
  ) {
    console.error(error);
    return Response.json(
      { error: "La base D1 requiere aplicar las migraciones pendientes antes de usar esta función." },
      { status: 503 },
    );
  }

  console.error(error);
  return Response.json({ error: "Error interno." }, { status: 500 });
}
