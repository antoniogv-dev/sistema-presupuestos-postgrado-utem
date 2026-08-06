import { z } from "zod";
import { apiError, hasAccess, requireApiIdentity } from "@/lib/auth/api-access";
import { d1Id, d1Json, runD1Batch } from "@/lib/database/d1-atomic";
import { getPrismaClient } from "@/lib/database/prisma";
import { d1Database } from "@/lib/runtime-env";

const itemSchema = z.object({
  key: z.string().min(1),
  kind: z.enum(["DESCUENTO", "BECA_ARANCEL", "BECA_MANUTENCION", "COSTO", "INGRESO_EXTRAORDINARIO"]),
  name: z.string().min(1),
  active: z.boolean().default(true),
  position: z.number().int().min(0),
  config: z.record(z.string(), z.unknown()),
});
const schema = z.object({
  code: z.string().min(1),
  name: z.string().min(3),
  programType: z.enum(["DOCTORADO", "MAGISTER_ACADEMICO", "MAGISTER_PROFESIONAL", "OTRO"]),
  description: z.string().optional(),
  active: z.boolean().default(true),
  programId: z.string().nullable().optional(),
  items: z.array(itemSchema),
});

export async function GET(request: Request) {
  try {
    await requireApiIdentity(request);
    const templates = await getPrismaClient().budgetTemplate.findMany({
      where: { active: true },
      include: { items: { orderBy: { position: "asc" } } },
      orderBy: [{ programType: "asc" }, { name: "asc" }],
    });
    return Response.json(templates.map((template) => ({
      ...template,
      items: template.items.map((item) => ({
        id: item.id,
        key: item.itemKey,
        kind: item.kind,
        name: item.name,
        active: item.active,
        position: item.position,
        config: item.config,
      })),
    })));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireApiIdentity(request);
    if (!hasAccess(identity, "GESTOR")) throw new Error("FORBIDDEN");
    const input = schema.parse(await request.json());
    const prisma = getPrismaClient();

    const templateId = d1Id("template");
    const database = d1Database();
    const statements: D1PreparedStatement[] = [
      database.prepare(`
        INSERT INTO "BudgetTemplate" (
          "id", "code", "name", "programType", "description", "version", "active",
          "createdAt", "updatedAt", "programId"
        ) VALUES (?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
      `).bind(
        templateId,
        input.code,
        input.name,
        input.programType,
        input.description ?? null,
        input.active ? 1 : 0,
        input.programId ?? null,
      ),
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
          "id", "userId", "entity", "entityId", "action", "newValue", "createdAt"
        ) VALUES (?, ?, 'BudgetTemplate', ?, 'CREATE', ?, CURRENT_TIMESTAMP)
      `).bind(d1Id("audit"), identity.userId, templateId, d1Json(input)),
    );
    await runD1Batch(statements);

    const created = await prisma.budgetTemplate.findUnique({
      where: { id: templateId },
      include: { items: { orderBy: { position: "asc" } } },
    });
    return Response.json(created, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
