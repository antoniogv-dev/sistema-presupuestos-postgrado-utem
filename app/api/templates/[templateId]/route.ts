import { z } from "zod";
import { apiError, hasAccess, requireApiIdentity } from "@/lib/auth/api-access";
import { d1Id, d1Json, runD1Batch } from "@/lib/database/d1-atomic";
import { d1Database } from "@/lib/runtime-env";

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

type TemplateRow = {
  id: string;
  code: string;
  name: string;
  programType: string;
  description: string | null;
  version: number;
  active: number | boolean;
  programId: string | null;
  settings: string | null;
};

type TemplateItemRow = {
  id: string;
  itemKey: string;
  kind: string;
  name: string;
  active: number | boolean;
  position: number;
  config: string | null;
};

function parseJsonObject(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function normalizeItemKeys(items: z.infer<typeof itemSchema>[]) {
  const used = new Set<string>();
  return items.map((item, index) => {
    const base = item.key.trim() || `item-${index + 1}`;
    let key = base;
    let suffix = 2;
    while (used.has(key)) key = `${base}-${suffix++}`;
    used.add(key);
    return { ...item, key, position: index };
  });
}

async function readTemplate(templateId: string): Promise<{ template: TemplateRow; items: TemplateItemRow[] } | null> {
  const database = d1Database();
  const template = await database.prepare(`
    SELECT "id", "code", "name", "programType", "description", "version", "active", "programId", "settings"
    FROM "BudgetTemplate"
    WHERE "id" = ?
    LIMIT 1
  `).bind(templateId).first();
  if (!template) return null;

  const itemResult = await database.prepare(`
    SELECT "id", "itemKey", "kind", "name", "active", "position", "config"
    FROM "BudgetTemplateItem"
    WHERE "templateId" = ?
    ORDER BY "position", "itemKey"
  `).bind(templateId).all();

  return {
    template: template as unknown as TemplateRow,
    items: (itemResult.results ?? []) as unknown as TemplateItemRow[],
  };
}

function apiShape(template: TemplateRow, items: TemplateItemRow[]) {
  return {
    id: template.id,
    code: template.code,
    name: template.name,
    programType: template.programType,
    description: template.description ?? "",
    version: Number(template.version),
    active: template.active === true || template.active === 1,
    programId: template.programId ?? undefined,
    settings: parseJsonObject(template.settings),
    items: items.map((item) => ({
      id: item.id,
      key: item.itemKey,
      kind: item.kind,
      name: item.name,
      active: item.active === true || item.active === 1,
      position: Number(item.position),
      config: parseJsonObject(item.config),
    })),
  };
}

export async function PUT(request: Request, context: { params: Promise<{ templateId: string }> }) {
  try {
    const identity = await requireApiIdentity(request);
    if (!hasAccess(identity, "GESTOR")) throw new Error("FORBIDDEN");
    const { templateId } = await context.params;
    const input = schema.parse(await request.json());
    const previous = await readTemplate(templateId);
    if (!previous) throw new Error("NOT_FOUND");

    // v10.20: las plantillas profesionales deben poder modificarse sin depender de una
    // lectura Prisma posterior al batch. Se normalizan claves y se devuelve lo persistido
    // directamente desde D1, evitando falsos errores de guardado después de una escritura válida.
    const items = normalizeItemKeys(input.items);
    const database = d1Database();
    const nextVersion = Number(previous.template.version) + 1;
    const statements: D1PreparedStatement[] = [
      database.prepare(`DELETE FROM "BudgetTemplateItem" WHERE "templateId" = ?`).bind(templateId),
      database.prepare(`
        UPDATE "BudgetTemplate"
        SET "name" = ?, "description" = ?, "active" = ?, "programId" = ?, "settings" = ?, "version" = ?,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ?
      `).bind(input.name, input.description ?? null, input.active ? 1 : 0, input.programId ?? null, d1Json(input.settings ?? {}), nextVersion, templateId),
    ];

    for (const item of items) {
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
      `).bind(
        d1Id("audit"),
        identity.userId,
        templateId,
        d1Json(apiShape(previous.template, previous.items)),
        d1Json({ ...input, items, version: nextVersion }),
      ),
    );

    await runD1Batch(statements);

    const persisted = await readTemplate(templateId);
    if (!persisted) throw new Error("NOT_FOUND");
    return Response.json(apiShape(persisted.template, persisted.items));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ templateId: string }> }) {
  try {
    const identity = await requireApiIdentity(request);
    if (!hasAccess(identity, "GESTOR")) throw new Error("FORBIDDEN");
    const { templateId } = await context.params;
    const previous = await readTemplate(templateId);
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
        d1Json(apiShape(previous.template, previous.items)),
        d1Json({ active: false, version: Number(previous.template.version) + 1 }),
      ),
    ]);
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
