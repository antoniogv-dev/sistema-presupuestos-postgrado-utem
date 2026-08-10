import { z, ZodError } from "zod";
import { apiError, hasAccess, requireApiIdentity, type AppRole } from "@/lib/auth/api-access";
import { hashPassword } from "@/lib/auth/password";
import { d1Id, d1Json, runD1Batch } from "@/lib/database/d1-atomic";
import { getPrismaClient } from "@/lib/database/prisma";
import { d1Database } from "@/lib/runtime-env";

const roleSchema = z.enum(["ADMIN", "CREADOR", "LECTOR", "GESTOR", "VISTO_BUENO", "APROBADOR"]);

const APP_ROLES: AppRole[] = ["ADMIN", "CREADOR", "LECTOR", "GESTOR", "VISTO_BUENO", "APROBADOR"];

function isAppRole(code: string): code is AppRole {
  return APP_ROLES.includes(code as AppRole);
}

const assignmentSchema = z.object({
  userId: z.string().min(1).optional(),
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  name: z.string().trim().min(3).max(160),
  password: z.string().min(8).max(200).optional().or(z.literal("")),
  roles: z.array(roleSchema).min(1),
  active: z.boolean().default(true),
});

const activeSchema = z.object({
  userId: z.string().min(1),
  active: z.boolean(),
});

export const dynamic = "force-dynamic";

function requireAdmin(identity: Awaited<ReturnType<typeof requireApiIdentity>>) {
  if (!hasAccess(identity, "ADMIN")) throw new Error("FORBIDDEN");
}

export async function GET(request: Request) {
  try {
    const identity = await requireApiIdentity(request);
    requireAdmin(identity);
    const users = await getPrismaClient().user.findMany({
      include: { roles: { include: { role: true } } },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    });
    return Response.json(users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      active: user.active,
      hasPassword: Boolean(user.passwordHash),
      roles: user.roles.map((assignment) => assignment.role.code).filter(isAppRole),
    })));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireApiIdentity(request);
    requireAdmin(identity);
    const input = assignmentSchema.parse(await request.json());
    if (input.userId === identity.userId && (!input.active || !input.roles.includes("ADMIN"))) {
      return Response.json(
        { error: "El administrador actual debe conservar su rol Administrador y permanecer activo." },
        { status: 409 },
      );
    }
    const prisma = getPrismaClient();
    const roles = await prisma.role.findMany({ where: { code: { in: input.roles } } });
    if (roles.length !== new Set(input.roles).size) throw new Error("NOT_FOUND");

    const existing = input.userId
      ? await prisma.user.findUnique({ where: { id: input.userId }, select: { id: true, email: true, passwordHash: true } })
      : await prisma.user.findUnique({ where: { email: input.email }, select: { id: true, email: true, passwordHash: true } });
    if (input.userId && !existing) throw new Error("NOT_FOUND");
    const emailOwner = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
    if (emailOwner && emailOwner.id !== existing?.id) throw new Error("CONFLICT");
    if (!existing && !input.password) {
      return Response.json({ error: "La contraseña es obligatoria para un usuario nuevo." }, { status: 400 });
    }

    const userId = existing?.id ?? d1Id("user");
    const password = input.password ? await hashPassword(input.password) : null;
    const database = d1Database();
    const statements: D1PreparedStatement[] = [];

    if (existing) {
      if (password) {
        statements.push(database.prepare(`
          UPDATE "User" SET
            "email" = ?, "name" = ?, "active" = ?,
            "passwordHash" = ?, "passwordSalt" = ?, "passwordIterations" = ?,
            "passwordUpdatedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ?
        `).bind(input.email, input.name, input.active ? 1 : 0, password.hash, password.salt, password.iterations, userId));
      } else {
        statements.push(database.prepare(`
          UPDATE "User" SET "email" = ?, "name" = ?, "active" = ?, "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ?
        `).bind(input.email, input.name, input.active ? 1 : 0, userId));
      }
    } else if (password) {
      statements.push(database.prepare(`
        INSERT INTO "User" (
          "id", "email", "name", "active", "passwordHash", "passwordSalt", "passwordIterations",
          "passwordUpdatedAt", "createdAt", "updatedAt"
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).bind(userId, input.email, input.name, input.active ? 1 : 0, password.hash, password.salt, password.iterations));
    }

    statements.push(database.prepare(`DELETE FROM "UserRole" WHERE "userId" = ?`).bind(userId));
    for (const role of roles) {
      statements.push(database.prepare(`INSERT INTO "UserRole" ("userId", "roleId") VALUES (?, ?)`).bind(userId, role.id));
    }
    statements.push(database.prepare(`
      INSERT INTO "AuditLog" ("id", "userId", "entity", "entityId", "action", "newValue", "createdAt")
      VALUES (?, ?, 'UserRole', ?, 'UPSERT_USER_ACCESS', ?, CURRENT_TIMESTAMP)
    `).bind(d1Id("audit"), identity.userId, userId, d1Json({ email: input.email, roles: input.roles, active: input.active, passwordChanged: Boolean(password) })));

    await runD1Batch(statements);
    return Response.json({
      id: userId,
      email: input.email,
      name: input.name,
      active: input.active,
      hasPassword: Boolean(password || existing?.passwordHash),
      roles: input.roles,
    }, { status: existing ? 200 : 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: "Datos de usuario inválidos.", issues: error.issues }, { status: 400 });
    }
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const identity = await requireApiIdentity(request);
    requireAdmin(identity);
    const input = activeSchema.parse(await request.json());
    if (input.userId === identity.userId && !input.active) {
      return Response.json({ error: "El administrador no puede deshabilitar su propia sesión." }, { status: 409 });
    }
    const exists = await getPrismaClient().user.findUnique({ where: { id: input.userId }, select: { id: true } });
    if (!exists) throw new Error("NOT_FOUND");
    const database = d1Database();
    await runD1Batch([
      database.prepare(`UPDATE "User" SET "active" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ?`).bind(input.active ? 1 : 0, input.userId),
      database.prepare(`INSERT INTO "AuditLog" ("id", "userId", "entity", "entityId", "action", "newValue", "createdAt") VALUES (?, ?, 'User', ?, 'SET_ACTIVE', ?, CURRENT_TIMESTAMP)`).bind(d1Id("audit"), identity.userId, input.userId, d1Json({ active: input.active })),
    ]);
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
