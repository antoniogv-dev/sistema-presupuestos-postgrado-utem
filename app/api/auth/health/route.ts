import { d1Database, runtimeValue } from "@/lib/runtime-env";

const REQUIRED_AUTH_COLUMNS = [
  "passwordHash",
  "passwordSalt",
  "passwordIterations",
  "passwordUpdatedAt",
] as const;

export async function GET() {
  try {
    const database = d1Database();
    const userColumnsResult = await database.prepare(`PRAGMA table_info("User")`).all();
    const userColumns = new Set(
      (userColumnsResult.results ?? [])
        .map((row) => (row as Record<string, unknown>).name)
        .filter((value): value is string => typeof value === "string"),
    );
    const missingColumns = REQUIRED_AUTH_COLUMNS.filter((column) => !userColumns.has(column));

    const sessionTable = await database
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'UserSession'`)
      .first();

    const roleResult = await database.prepare(`
      SELECT COUNT(*) AS count
      FROM "Role"
      WHERE "code" IN ('ADMIN', 'GESTOR', 'VISTO_BUENO', 'APROBADOR')
    `).first();
    const roleCount = Number((roleResult as Record<string, unknown> | null)?.count ?? 0);

    const adminEmailConfigured = Boolean(runtimeValue("BOOTSTRAP_ADMIN_EMAIL"));
    const adminPasswordConfigured = Boolean(runtimeValue("BOOTSTRAP_ADMIN_PASSWORD"));
    const ready = missingColumns.length === 0 && Boolean(sessionTable) && roleCount >= 4 && adminEmailConfigured && adminPasswordConfigured;

    return Response.json({
      ok: ready,
      code: ready ? "AUTH_READY" : "AUTH_NOT_READY",
      checks: {
        d1Binding: true,
        authColumns: missingColumns.length === 0,
        missingAuthColumns: missingColumns,
        userSessionTable: Boolean(sessionTable),
        requiredRoles: roleCount >= 4,
        bootstrapAdminEmail: adminEmailConfigured,
        bootstrapAdminPassword: adminPasswordConfigured,
      },
    }, { status: ready ? 200 : 503 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[AUTH_HEALTH_ERROR]", message);
    return Response.json({
      ok: false,
      code: message === "DATABASE_NOT_CONFIGURED" ? "AUTH_D1_BINDING_MISSING" : "AUTH_HEALTH_INTERNAL_ERROR",
      checks: {
        d1Binding: message !== "DATABASE_NOT_CONFIGURED",
      },
    }, { status: 503 });
  }
}
