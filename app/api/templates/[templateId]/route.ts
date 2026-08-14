import { z } from "zod";
import { apiError, hasAccess, requireApiIdentity } from "@/lib/auth/api-access";
import { d1Id, d1Json, runD1Batch } from "@/lib/database/d1-atomic";
import { getPrismaClient } from "@/lib/database/prisma";
import { d1Database } from "@/lib/runtime-env";
import { templateApiShape } from "@/lib/templates/api-shape";

const itemSchema = z.object({
  key: z.string().min(1),
  kind: z.enum(["DESCUENTO", "BECA_ARANCEL", "BECA_MANUTENCION", "COSTO", "INGRESO_EXTRAORDINARIO", "PARAMETRO_ANUAL"]),
  name: z.string().min(1),
  active: z.boolean(),
  position: z.number().int().min(0),
  config: z.record(z.string(), z.unknown()),
});
const schema = z.object({
  name: z.string().min(3),
  description: z.string().optional(),
  active: z.boolean(),
  programId: z.string().nullable().optional(),
  settings: z.record(z.string(), z.unknown()).default({}),
  items: z.array(itemSchema),
});

export async function PUT(request: Request, context: { params: Promise<{ templateId: string }> }) {
  try {
    const identity = await requireApiIdentity(request);
    if (!hasAccess(identity, "GESTOR")) throw new Error("FORBIDDEN");
    const { templateId } = await context.params;
    const input = schema.parse(await request.json());
    const prisma = getPrismaClient();
    const previous = await prisma.budgetTemplate.findUnique({ where: { id: templateId }, include: { items: true } });
    if (!previous) throw new Error("NOT_FOUND");

    const database = d1Database();
    const statements: D1PreparedStatement[] = [
      database.prepare(`DELETE FROM "BudgetTemplateItem" WHERE "templateId" = ?`).bind(templateId),
      database.prepare(`
        UPDATE "BudgetTemplate"
        SET "name" = ?, "description" = ?, "active" = ?, "programId" = ?, "settings" = ?, "version" = "version" + 1,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ?
      `).bind(input.name, input.description ?? null, input.active ? 1 : 0, input.programId ?? null, d1Json(input.settings ?? {}), templateId),
    ];
    for (const item of input.items) {
      statements.push(
        database.prepare(`
          INSERT INTO "BudgetTemplateItem" (
            "id", "templateId", "itemKey", "kind", "name", "active", "position", "config",
            "createdAt", "updatedAt"
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).bind(
          d1Id("template-item"),
          templateId,
          item.key,
          item.kind,
          item.name,
          item.active ? 1 : 0,
          item.position,
          d1Json(item.config),
        ),
      );
    }
    statements.push(
      database.prepare(`
        INSERT INTO "AuditLog" (
          "id", "userId", "entity", "entityId", "action", "previousValue", "newValue", "createdAt"
        ) VALUES (?, ?, 'BudgetTemplate', ?, 'UPDATE', ?, ?, CURRENT_TIMESTAMP)
      `).bind(d1Id("audit"), identity.userId, templateId, d1Json(previous), d1Json(input)),
    );
    await runD1Batch(statements);

    const updated = await prisma.budgetTemplate.findUnique({
      where: { id: templateId },
      include: { items: { orderBy: { position: "asc" } } },
    });
    if (!updated) throw new Error("NOT_FOUND");
    return Response.json(templateApiShape(updated));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ templateId: string }> }) {
  try {
    const identity = await requireApiIdentity(request);
    if (!hasAccess(identity, "GESTOR")) throw new Error("FORBIDDEN");
    const { templateId } = await context.params;
    const prisma = getPrismaClient();
    const previous = await prisma.budgetTemplate.findUnique({ where: { id: templateId } });
    if (!previous) throw new Error("NOT_FOUND");
    const database = d1Database();
    await runD1Batch([
      database.prepare(`
        UPDATE "BudgetTemplate"
        SET "active" = 0, "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ?
      `).bind(templateId),
      database.prepare(`
        INSERT INTO "AuditLog" (
          "id", "userId", "entity", "entityId", "action", "previousValue", "newValue", "createdAt"
        ) VALUES (?, ?, 'BudgetTemplate', ?, 'DEACTIVATE', ?, ?, CURRENT_TIMESTAMP)
      `).bind(
        d1Id("audit"),
        identity.userId,
        templateId,
        d1Json(previous),
        d1Json({ active: false, version: previous.version + 1 }),
      ),
    ]);
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
