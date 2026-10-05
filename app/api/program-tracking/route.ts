import { z } from "zod";
import { apiError, hasAnyAccess, requireApiIdentity } from "@/lib/auth/api-access";
import { d1Id, d1Json, runD1Batch } from "@/lib/database/d1-atomic";
import { d1Database } from "@/lib/runtime-env";
import {
  fallbackBudgetStage,
  normalizeTrackingSnapshot,
  type ProgramTrackingRecord,
  type ProgramTrackingSnapshot,
} from "@/lib/tracking/program-tracking";
import type { ProgramType } from "@/lib/calculations/types";

const academicStatusSchema = z.enum(["NO_RECIBIDO", "RECIBIDO", "ENVIADO", "OBSERVADO", "CONFORME"]);
const budgetStageSchema = z.enum([
  "NO_INICIADO", "EN_ELABORACION", "LISTO", "REVISION_DIRECCION", "REVISION_COMITE",
  "REVISION_VRAF", "OBSERVADO", "EN_ACTUALIZACION", "PASA_FIRMA", "APROBADO", "NO_APLICA",
]);
const prioritySchema = z.enum(["BAJA", "MEDIA", "ALTA"]);

const updateSchema = z.object({
  programId: z.string().min(1),
  academicStatus: academicStatusSchema,
  budgetStage: budgetStageSchema,
  priority: prioritySchema,
  note: z.string().trim().max(1500).default(""),
  responsible: z.string().trim().max(200).default(""),
  memoNumber: z.string().trim().max(100).default(""),
  approvalDate: z.string().trim().max(20).default(""),
  approvalUrl: z.union([z.string().url(), z.literal("")]).default(""),
});

type TrackingRow = {
  programId: string;
  code: string;
  name: string;
  type: string;
  faculty: string;
  director: string;
  cohortName: string | null;
  startYear: number | null;
  startSemester: number | null;
  latestBudgetStatus: string | null;
  latestWorkflowStage: string | null;
  trackingJson: unknown;
  trackingUpdatedAt: string | null;
  updatedByName: string | null;
};

function parseSnapshot(value: unknown): Partial<ProgramTrackingSnapshot> | null {
  if (!value) return null;
  if (typeof value === "object") return value as Partial<ProgramTrackingSnapshot>;
  if (typeof value !== "string") return null;
  try { return JSON.parse(value) as Partial<ProgramTrackingSnapshot>; }
  catch { return null; }
}

function cohortLabel(row: TrackingRow): string {
  if (row.cohortName?.trim()) return row.cohortName.trim();
  if (row.startYear && row.startSemester) return `${row.startYear}-${row.startSemester}S`;
  return "Sin cohorte activa";
}

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireApiIdentity(request);
    const database = d1Database();
    const result = await database.prepare(`
      SELECT
        p."id" AS programId,
        p."code" AS code,
        p."name" AS name,
        p."type" AS type,
        p."faculty" AS faculty,
        p."director" AS director,
        b."cohortName" AS cohortName,
        b."startYear" AS startYear,
        b."startSemester" AS startSemester,
        b."status" AS latestBudgetStatus,
        b."workflowStage" AS latestWorkflowStage,
        a."newValue" AS trackingJson,
        a."createdAt" AS trackingUpdatedAt,
        u."name" AS updatedByName
      FROM "Program" p
      LEFT JOIN "CohortBudget" b ON b."id" = (
        SELECT b2."id"
        FROM "CohortBudget" b2
        WHERE b2."programId" = p."id"
          AND b2."deletedAt" IS NULL
          AND b2."status" <> 'REEMPLAZADO'
        ORDER BY b2."startYear" DESC, b2."startSemester" DESC, b2."updatedAt" DESC
        LIMIT 1
      )
      LEFT JOIN "AuditLog" a ON a."id" = (
        SELECT a2."id"
        FROM "AuditLog" a2
        WHERE a2."entity" = 'ProgramTracking'
          AND a2."entityId" = p."id"
        ORDER BY a2."createdAt" DESC
        LIMIT 1
      )
      LEFT JOIN "User" u ON u."id" = a."userId"
      WHERE p."status" <> 'INACTIVO'
      ORDER BY p."type" ASC, p."name" ASC
    `).all();

    const rows = (result.results ?? []) as unknown as TrackingRow[];
    const records: ProgramTrackingRecord[] = rows.map((row) => {
      const fallbackStage = fallbackBudgetStage(row.latestBudgetStatus, row.latestWorkflowStage);
      const snapshot = normalizeTrackingSnapshot(parseSnapshot(row.trackingJson), fallbackStage);
      return {
        ...snapshot,
        programId: row.programId,
        code: row.code,
        name: row.name,
        type: row.type as ProgramType,
        faculty: row.faculty,
        director: row.director,
        currentCohort: cohortLabel(row),
        latestBudgetStatus: row.latestBudgetStatus,
        latestWorkflowStage: row.latestWorkflowStage,
        updatedAt: row.trackingUpdatedAt ?? "",
        updatedByName: row.updatedByName ?? "",
      };
    });

    return Response.json(records);
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const identity = await requireApiIdentity(request);
    if (!hasAnyAccess(identity, ["GESTOR", "VISTO_BUENO", "APROBADOR"])) throw new Error("FORBIDDEN");
    const input = updateSchema.parse(await request.json());
    const database = d1Database();

    const program = await database.prepare(`SELECT "id" FROM "Program" WHERE "id" = ? AND "status" <> 'INACTIVO' LIMIT 1`)
      .bind(input.programId)
      .first();
    if (!program) throw new Error("NOT_FOUND");

    const previous = await database.prepare(`
      SELECT "newValue" AS value
      FROM "AuditLog"
      WHERE "entity" = 'ProgramTracking' AND "entityId" = ?
      ORDER BY "createdAt" DESC
      LIMIT 1
    `).bind(input.programId).first();

    const nextSnapshot: ProgramTrackingSnapshot = {
      academicStatus: input.academicStatus,
      budgetStage: input.budgetStage,
      priority: input.priority,
      note: input.note,
      responsible: input.responsible,
      memoNumber: input.memoNumber,
      approvalDate: input.approvalDate,
      approvalUrl: input.approvalUrl,
    };

    await runD1Batch([
      database.prepare(`
        INSERT INTO "AuditLog" (
          "id", "userId", "entity", "entityId", "previousValue", "newValue", "action", "createdAt"
        ) VALUES (?, ?, 'ProgramTracking', ?, ?, ?, 'UPDATE_PROGRAM_TRACKING', CURRENT_TIMESTAMP)
      `).bind(
        d1Id("tracking"),
        identity.userId,
        input.programId,
        previous ? (previous as Record<string, unknown>).value ?? null : null,
        d1Json(nextSnapshot),
      ),
    ]);

    return Response.json({ ok: true, updatedAt: new Date().toISOString(), updatedByName: identity.name, ...nextSnapshot });
  } catch (error) {
    return apiError(error);
  }
}
