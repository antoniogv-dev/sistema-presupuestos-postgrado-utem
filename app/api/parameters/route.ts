import { z, ZodError } from "zod";
import { apiError, hasAccess, requireApiIdentity } from "@/lib/auth/api-access";
import { d1Id, d1Json, runD1Batch } from "@/lib/database/d1-atomic";
import { getPrismaClient } from "@/lib/database/prisma";
import {
  getInstitutionalParametersFromDatabase,
  PARAMETER_CODES,
  PARAMETER_SCOPES,
} from "@/lib/parameters/service";
import { d1Database } from "@/lib/runtime-env";

const changeSchema = z.object({
  code: z.enum(PARAMETER_CODES),
  scope: z.enum(PARAMETER_SCOPES),
  year: z.number().int().min(2000).max(2100).nullable(),
  amount: z.number().finite().nonnegative(),
});

const payloadSchema = z.object({ changes: z.array(changeSchema).min(1).max(500) });

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireApiIdentity(request);
    return Response.json(await getInstitutionalParametersFromDatabase());
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const identity = await requireApiIdentity(request);
    if (!hasAccess(identity, "GESTOR")) throw new Error("FORBIDDEN");
    const payload = payloadSchema.parse(await request.json());
    const prisma = getPrismaClient();
    const definitions = await prisma.institutionalParameter.findMany({
      where: { code: { in: [...new Set(payload.changes.map((change) => change.code))] } },
      select: { id: true, code: true },
    });
    const byCode = new Map(definitions.map((item) => [item.code, item.id]));
    if (byCode.size !== new Set(payload.changes.map((change) => change.code)).size) {
      throw new Error("DATABASE_NOT_INITIALIZED");
    }

    const database = d1Database();
    const statements: D1PreparedStatement[] = [];
    for (const change of payload.changes) {
      const parameterId = byCode.get(change.code);
      if (!parameterId) throw new Error("DATABASE_NOT_INITIALIZED");
      if (change.year === null) {
        // SQLite considera NULL distinto dentro de una clave única; eliminamos primero para mantener una sola vigencia escalar.
        statements.push(database.prepare(
          `DELETE FROM "AnnualParameter" WHERE "parameterId" = ? AND "year" IS NULL AND "scope" = ?`,
        ).bind(parameterId, change.scope));
        statements.push(database.prepare(`
          INSERT INTO "AnnualParameter" ("id", "parameterId", "year", "scope", "amount")
          VALUES (?, ?, NULL, ?, ?)
        `).bind(d1Id("annual-parameter"), parameterId, change.scope, change.amount));
      } else {
        statements.push(database.prepare(`
          INSERT INTO "AnnualParameter" ("id", "parameterId", "year", "scope", "amount")
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT("parameterId", "year", "scope") DO UPDATE SET "amount" = excluded."amount"
        `).bind(d1Id("annual-parameter"), parameterId, change.year, change.scope, change.amount));
      }
    }
    statements.push(database.prepare(`
      INSERT INTO "AuditLog" ("id", "userId", "entity", "entityId", "action", "newValue", "createdAt")
      VALUES (?, ?, 'InstitutionalParameter', 'GENERAL', 'UPDATE_PARAMETERS', ?, CURRENT_TIMESTAMP)
    `).bind(d1Id("audit"), identity.userId, d1Json(payload.changes)));

    await runD1Batch(statements);
    return Response.json({
      message: "Parámetros institucionales actualizados.",
      parameters: await getInstitutionalParametersFromDatabase(),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: "Parámetros inválidos.", issues: error.issues }, { status: 400 });
    }
    return apiError(error);
  }
}
