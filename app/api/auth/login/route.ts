import { cookies } from "next/headers";
import { z } from "zod";
import { ensureBootstrapAdministrator } from "@/lib/auth/api-access";
import { createSessionToken, hashSessionToken, verifyPassword } from "@/lib/auth/password";
import { d1Id, runD1Batch } from "@/lib/database/d1-atomic";
import { getPrismaClient } from "@/lib/database/prisma";
import { d1Database, runtimeValue } from "@/lib/runtime-env";

const loginSchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8).max(200),
});

const SESSION_SECONDS = 8 * 60 * 60;
const REQUIRED_AUTH_COLUMNS = [
  "passwordHash",
  "passwordSalt",
  "passwordIterations",
  "passwordUpdatedAt",
] as const;

interface LoginFailure {
  status: number;
  code: string;
  error: string;
}

function errorChain(error: unknown): string {
  const messages: string[] = [];
  let current: unknown = error;
  let depth = 0;
  while (current && depth < 5) {
    if (current instanceof Error) {
      messages.push(current.message);
      current = current.cause;
    } else {
      messages.push(String(current));
      break;
    }
    depth += 1;
  }
  return messages.join(" | ");
}

function classifyLoginFailure(error: unknown): LoginFailure {
  const message = errorChain(error).toLowerCase();

  if (message.includes("database_not_configured")) {
    return {
      status: 503,
      code: "AUTH_D1_BINDING_MISSING",
      error: "La base D1 no está vinculada al Worker. Revise el binding DB.",
    };
  }

  if (
    message.includes("auth_migration_required") ||
    message.includes("database_not_initialized") ||
    message.includes("no such table") ||
    message.includes("no such column") ||
    message.includes("has no column named")
  ) {
    return {
      status: 503,
      code: "AUTH_D1_MIGRATION_REQUIRED",
      error: "La base D1 no tiene completa la estructura de autenticación. Aplique la migración 0003_functional_improvements.sql.",
    };
  }

  if (message.includes("bootstrap_admin_password_missing")) {
    return {
      status: 503,
      code: "AUTH_ADMIN_SECRET_MISSING",
      error: "La contraseña inicial del administrador no está disponible para el Worker. Revise BOOTSTRAP_ADMIN_PASSWORD en Variables and Secrets.",
    };
  }

  return {
    status: 500,
    code: "AUTH_INTERNAL_ERROR",
    error: "Ocurrió un error interno al iniciar sesión. Revise Logs → Live usando el código AUTH_INTERNAL_ERROR.",
  };
}

async function assertAuthDatabaseReady() {
  const database = d1Database();

  const userColumnsResult = await database.prepare(`PRAGMA table_info("User")`).all();
  const userColumns = new Set(
    (userColumnsResult.results ?? [])
      .map((row) => (row as Record<string, unknown>).name)
      .filter((value): value is string => typeof value === "string"),
  );

  const missingColumns = REQUIRED_AUTH_COLUMNS.filter((column) => !userColumns.has(column));
  if (missingColumns.length) {
    throw new Error(`AUTH_MIGRATION_REQUIRED:User:${missingColumns.join(",")}`);
  }

  const sessionTable = await database
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'UserSession'`)
    .first();
  if (!sessionTable) throw new Error("AUTH_MIGRATION_REQUIRED:UserSession");

  const roleResult = await database.prepare(`
    SELECT COUNT(*) AS count
    FROM "Role"
    WHERE "code" IN ('ADMIN', 'GESTOR', 'VISTO_BUENO', 'APROBADOR')
  `).first();
  const roleCount = Number((roleResult as Record<string, unknown> | null)?.count ?? 0);
  if (roleCount < 4) throw new Error("DATABASE_NOT_INITIALIZED:AUTH_ROLES");
}

export async function POST(request: Request) {
  try {
    const input = loginSchema.parse(await request.json());
    await assertAuthDatabaseReady();

    let user = await getPrismaClient().user.findUnique({
      where: { email: input.email },
      include: { roles: { include: { role: true } } },
    });

    // Si el correo coincide con BOOTSTRAP_ADMIN_EMAIL, se reconcilian nombre y roles
    // antes de validar la contraseña. En el primer acceso también se fija el hash de la
    // contraseña inicial si BOOTSTRAP_ADMIN_PASSWORD está configurado como Secret.
    const bootstrap = await ensureBootstrapAdministrator(input.email);
    if (bootstrap) user = bootstrap;

    const bootstrapEmail = runtimeValue("BOOTSTRAP_ADMIN_EMAIL")?.trim().toLowerCase();
    if (
      bootstrapEmail === input.email &&
      user &&
      !user.passwordHash &&
      !runtimeValue("BOOTSTRAP_ADMIN_PASSWORD")
    ) {
      throw new Error("BOOTSTRAP_ADMIN_PASSWORD_MISSING");
    }

    if (!user || !user.active || !user.passwordHash || !user.passwordSalt || !user.passwordIterations) {
      return Response.json(
        { error: "Correo o contraseña incorrectos.", code: "AUTH_INVALID_CREDENTIALS" },
        { status: 401 },
      );
    }

    const valid = await verifyPassword(
      input.password,
      user.passwordHash,
      user.passwordSalt,
      user.passwordIterations,
    );
    if (!valid) {
      return Response.json(
        { error: "Correo o contraseña incorrectos.", code: "AUTH_INVALID_CREDENTIALS" },
        { status: 401 },
      );
    }

    const token = createSessionToken();
    const tokenHash = await hashSessionToken(token);
    const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000);
    const database = d1Database();
    await runD1Batch([
      database.prepare(`DELETE FROM "UserSession" WHERE "userId" = ? OR "expiresAt" <= CURRENT_TIMESTAMP`).bind(user.id),
      database.prepare(`
        INSERT INTO "UserSession" ("id", "userId", "tokenHash", "expiresAt", "createdAt")
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).bind(d1Id("session"), user.id, tokenHash, expiresAt.toISOString()),
    ]);

    const cookieStore = await cookies();
    cookieStore.set("utem_budget_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_SECONDS,
    });

    return Response.json({
      userId: user.id,
      email: user.email,
      name: user.name,
      roles: user.roles.map((assignment) => assignment.role.code),
    });
  } catch (error) {
    const failure = classifyLoginFailure(error);
    console.error("[AUTH_LOGIN_ERROR]", {
      code: failure.code,
      message: errorChain(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return Response.json(
      { error: failure.error, code: failure.code },
      { status: failure.status },
    );
  }
}
