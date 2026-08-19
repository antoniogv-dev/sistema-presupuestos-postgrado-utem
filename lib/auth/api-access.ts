import { createRemoteJWKSet, jwtVerify } from "jose";
import { ZodError } from "zod";
import { d1Id, runD1Batch } from "@/lib/database/d1-atomic";
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

export interface AuthUserRecord {
  id: string;
  email: string;
  name: string;
  active: boolean;
  passwordHash: string | null;
  passwordSalt: string | null;
  passwordIterations: number | null;
  roles: Array<{ role: { code: string } }>;
}

const accessKeySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
const SESSION_COOKIE = "utem_budget_session";
const BOOTSTRAP_ROLES = ["ADMIN", "GESTOR", "VISTO_BUENO", "APROBADOR"] as const;

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
  if (!teamDomain || !audience || teamDomain.includes("REEMPLAZAR") || audience.includes("REEMPLAZAR")) {
    throw new Error("ACCESS_NOT_CONFIGURED");
  }

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

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNullableInteger(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function rowIsActive(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

function buildAuthUser(rows: Record<string, unknown>[]): AuthUserRecord | null {
  if (!rows.length) return null;
  const first = rows[0];
  const id = asString(first.id);
  const email = asString(first.email);
  const name = asString(first.name);
  if (!id || !email || !name) throw new Error("AUTH_USER_ROW_INVALID");

  const roleCodes = rows
    .map((row) => asString(row.roleCode))
    .filter((value): value is string => Boolean(value));

  return {
    id,
    email,
    name,
    active: rowIsActive(first.active),
    passwordHash: asString(first.passwordHash),
    passwordSalt: asString(first.passwordSalt),
    passwordIterations: asNullableInteger(first.passwordIterations),
    roles: uniqueRoles(roleCodes).map((code) => ({ role: { code } })),
  };
}

async function findAuthUser(field: "email" | "id", value: string): Promise<AuthUserRecord | null> {
  const database = d1Database();
  const comparison = field === "email" ? `LOWER(u."email") = LOWER(?)` : `u."id" = ?`;
  const result = await database.prepare(`
    SELECT
      u."id" AS id,
      u."email" AS email,
      u."name" AS name,
      u."active" AS active,
      u."passwordHash" AS passwordHash,
      u."passwordSalt" AS passwordSalt,
      u."passwordIterations" AS passwordIterations,
      r."code" AS roleCode
    FROM "User" u
    LEFT JOIN "UserRole" ur ON ur."userId" = u."id"
    LEFT JOIN "Role" r ON r."id" = ur."roleId"
    WHERE ${comparison}
    ORDER BY r."code"
  `).bind(value).all();

  return buildAuthUser((result.results ?? []) as Record<string, unknown>[]);
}

export async function findAuthUserByEmail(email: string): Promise<AuthUserRecord | null> {
  return findAuthUser("email", email.trim().toLowerCase());
}

export async function findAuthUserById(id: string): Promise<AuthUserRecord | null> {
  return findAuthUser("id", id);
}

async function sessionUser(request: Request): Promise<AuthUserRecord | null> {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await hashSessionToken(token);
  const database = d1Database();
  const session = await database.prepare(`
    SELECT "userId" AS userId, "expiresAt" AS expiresAt
    FROM "UserSession"
    WHERE "tokenHash" = ?
    LIMIT 1
  `).bind(tokenHash).first();

  if (!session) return null;
  const row = session as Record<string, unknown>;
  const userId = asString(row.userId);
  const expiresAt = asString(row.expiresAt);
  if (!userId || !expiresAt || Date.parse(expiresAt) <= Date.now()) return null;

  const user = await findAuthUserById(userId);
  return user?.active ? user : null;
}

export async function ensureBootstrapAdministrator(email: string): Promise<AuthUserRecord | null> {
  const configured = runtimeValue("BOOTSTRAP_ADMIN_EMAIL")?.trim().toLowerCase();
  const normalizedEmail = email.trim().toLowerCase();
  if (!configured || configured !== normalizedEmail) return null;

  const database = d1Database();
  const roleResult = await database.prepare(`
    SELECT "id" AS id, "code" AS code
    FROM "Role"
    WHERE "code" IN ('ADMIN', 'GESTOR', 'VISTO_BUENO', 'APROBADOR')
    ORDER BY "code"
  `).all();

  const roles = (roleResult.results ?? []) as Record<string, unknown>[];
  const rolePairs = roles
    .map((row) => ({ id: asString(row.id), code: asString(row.code) }))
    .filter((row): row is { id: string; code: string } => Boolean(row.id && row.code));
  if (rolePairs.length < BOOTSTRAP_ROLES.length) throw new Error("DATABASE_NOT_INITIALIZED");

  const existing = await findAuthUserByEmail(normalizedEmail);
  const userId = existing?.id ?? d1Id("user");
  const configuredPassword = runtimeValue("BOOTSTRAP_ADMIN_PASSWORD");
  if (!configuredPassword && !existing?.passwordHash) throw new Error("BOOTSTRAP_ADMIN_PASSWORD_MISSING");

  let passwordFields: { hash: string; salt: string; iterations: number } | null = null;
  if (configuredPassword && !existing?.passwordHash) {
    passwordFields = await hashPassword(configuredPassword);
  }

  const statements: D1PreparedStatement[] = [];
  if (passwordFields) {
    statements.push(database.prepare(`
      INSERT INTO "User" (
        "id", "email", "name", "active", "passwordHash", "passwordSalt", "passwordIterations",
        "passwordUpdatedAt", "createdAt", "updatedAt"
      ) VALUES (?, ?, 'Antonio Gutiérrez', 1, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT("email") DO UPDATE SET
        "name" = 'Antonio Gutiérrez',
        "active" = 1,
        "passwordHash" = excluded."passwordHash",
        "passwordSalt" = excluded."passwordSalt",
        "passwordIterations" = excluded."passwordIterations",
        "passwordUpdatedAt" = CURRENT_TIMESTAMP,
        "updatedAt" = CURRENT_TIMESTAMP
    `).bind(userId, normalizedEmail, passwordFields.hash, passwordFields.salt, passwordFields.iterations));
  } else {
    statements.push(database.prepare(`
      INSERT INTO "User" ("id", "email", "name", "active", "createdAt", "updatedAt")
      VALUES (?, ?, 'Antonio Gutiérrez', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT("email") DO UPDATE SET
        "name" = 'Antonio Gutiérrez', "active" = 1, "updatedAt" = CURRENT_TIMESTAMP
    `).bind(userId, normalizedEmail));
  }

  for (const role of rolePairs) {
    statements.push(
      database.prepare(`INSERT OR IGNORE INTO "UserRole" ("userId", "roleId") VALUES (?, ?)`).bind(userId, role.id),
    );
  }

  await runD1Batch(statements);
  const provisioned = await findAuthUserById(userId);
  if (!provisioned) throw new Error("BOOTSTRAP_ADMIN_PROVISION_FAILED");
  return provisioned;
}

/**
 * La identidad puede provenir de Cloudflare Access, de una sesión interna segura o de una clave de servicio.
 * La ruta crítica de autenticación usa directamente el binding D1 para no depender del estado del adapter Prisma.
 */
export async function requireApiIdentity(request: Request): Promise<ApiIdentity> {
  const accessEmail = await verifiedAccessEmail(request);
  const configuredKey = runtimeValue("INTERNAL_API_KEY");
  const bearer = request.headers.get("authorization");
  const serviceAuthorized = Boolean(configuredKey && bearer === `Bearer ${configuredKey}`);

  let source: ApiIdentity["source"] = "INTERNAL_SESSION";
  let user = accessEmail ? await findAuthUserByEmail(accessEmail) : null;

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
    user = await findAuthUserById(request.headers.get("x-user-id") ?? "");
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
  if (message === "PROGRAM_IMMUTABLE") return Response.json({ error: "El programa es parte de la identidad del presupuesto y no puede reasignarse. Cree o clone una cohorte para otro programa." }, { status: 409 });
  if (message === "COHORT_PROGRAM_MISMATCH") return Response.json({ error: "La identificación de la cohorte corresponde a otro código de programa. Corrija la cohorte antes de guardar." }, { status: 409 });
  if (message === "TEMPLATE_PROGRAM_MISMATCH") return Response.json({ error: "La plantilla seleccionada no corresponde al programa del presupuesto." }, { status: 409 });

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
