import { AccessLevel } from "@prisma/client";
import { z, ZodError } from "zod";
import { apiError, hasAccess, requireApiIdentity } from "@/lib/auth/api-access";
import { d1Id, d1Json, runD1Batch } from "@/lib/database/d1-atomic";
import { getPrismaClient } from "@/lib/database/prisma";
import { d1Database } from "@/lib/runtime-env";

const assignmentSchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  name: z.string().trim().min(3).max(160),
  accessLevel: z.nativeEnum(AccessLevel),
  active: z.boolean().default(true),
});

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const identity = await requireApiIdentity(request);
    if (!hasAccess(identity, "APROBADOR")) throw new Error("FORBIDDEN");
    const users = await getPrismaClient().user.findMany({
      include: { roles: { include: { role: true } } },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    });
    return Response.json(users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      active: user.active,
      roles: user.roles.map((assignment) => assignment.role.accessLevel),
    })));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireApiIdentity(request);
    if (!hasAccess(identity, "APROBADOR")) throw new Error("FORBIDDEN");
    const input = assignmentSchema.parse(await request.json());
    const prisma = getPrismaClient();
    const role = await prisma.role.findFirst({ where: { accessLevel: input.accessLevel } });
    if (!role) throw new Error("NOT_FOUND");

    const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
    const userId = existing?.id ?? d1Id("user");
    const database = d1Database();
    const auditId = d1Id("audit");

    await runD1Batch([
      database.prepare(`
        INSERT INTO "User" ("id", "email", "name", "active", "createdAt", "updatedAt")
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT("email") DO UPDATE SET
          "name" = excluded."name",
          "active" = excluded."active",
          "updatedAt" = CURRENT_TIMESTAMP
      `).bind(userId, input.email, input.name, input.active ? 1 : 0),
      database.prepare(`DELETE FROM "UserRole" WHERE "userId" = ?`).bind(userId),
      database.prepare(`INSERT INTO "UserRole" ("userId", "roleId") VALUES (?, ?)`).bind(userId, role.id),
      database.prepare(`
        INSERT INTO "AuditLog" (
          "id", "userId", "entity", "entityId", "action", "newValue", "createdAt"
        ) VALUES (?, ?, 'UserRole', ?, 'ASSIGN_ACCESS_LEVEL', ?, CURRENT_TIMESTAMP)
      `).bind(
        auditId,
        identity.userId,
        userId,
        d1Json({ email: input.email, accessLevel: input.accessLevel, active: input.active }),
      ),
    ]);

    return Response.json({
      id: userId,
      email: input.email,
      name: input.name,
      active: input.active,
      roles: [input.accessLevel],
    }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: "Datos de usuario inválidos.", issues: error.issues }, { status: 400 });
    }
    return apiError(error);
  }
}
