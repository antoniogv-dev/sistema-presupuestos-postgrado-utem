import { ProgramType } from "@prisma/client";
import { z } from "zod";
import { apiError, hasAnyAccess, requireApiIdentity } from "@/lib/auth/api-access";
import { d1Id, d1Json, runD1Batch } from "@/lib/database/d1-atomic";
import { getPrismaClient } from "@/lib/database/prisma";
import { d1Database } from "@/lib/runtime-env";

const createSchema = z.object({
  programId: z.string().min(1),
  cohortName: z.string().trim().min(3),
  startYear: z.number().int().min(2000).max(2100),
  startSemester: z.union([z.literal(1), z.literal(2)]),
  durationSemesters: z.number().int().min(2).max(8),
  initialStudents: z.number().int().min(0),
  facultyOverheadRate: z.number().min(0).max(1),
  enrollmentRecognitionRate: z.number().min(0).max(1),
  authorizedInitialCarryover: z.number().int(),
  includeAuthorizedCarryover: z.boolean().default(true),
  normalizeSharedCosts: z.boolean().default(true),
  alertPotentialDuplicates: z.boolean().default(true),
  appliedTemplateId: z.string().nullable().optional(),
  appliedTemplateVersion: z.number().int().nullable().optional(),
  notes: z.string().optional(),
  responsibleId: z.string().min(1),
});

function json(value: unknown) {
  return JSON.parse(JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item));
}

function isAcademic(type: ProgramType): boolean {
  return type === ProgramType.DOCTORADO || type === ProgramType.MAGISTER_ACADEMICO;
}

export async function GET(request: Request) {
  try {
    await requireApiIdentity(request);
    const prisma = getPrismaClient();
    const budgets = await prisma.cohortBudget.findMany({
      where: { deletedAt: null },
      include: {
        program: { include: { annualTuitions: { orderBy: { year: "asc" } } } },
        appliedTemplate: true,
        responsible: { select: { id: true, name: true, email: true } },
        semesterPeriods: { include: { parameters: true }, orderBy: { position: "asc" } },
        discounts: true,
        externalIncome: true,
        items: true,
        versions: { orderBy: { number: "desc" }, take: 1 },
        workflowEvents: { include: { user: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
      },
      orderBy: { updatedAt: "desc" },
    });
    return Response.json(json(budgets));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireApiIdentity(request);
    if (!hasAnyAccess(identity, ["CREADOR", "GESTOR"])) throw new Error("FORBIDDEN");
    const input = createSchema.parse(await request.json());
    const prisma = getPrismaClient();
    const program = await prisma.program.findUnique({ where: { id: input.programId }, select: { type: true } });
    if (!program) throw new Error("NOT_FOUND");

    const effectiveInput = {
      ...input,
      facultyOverheadRate: isAcademic(program.type) ? 0 : input.facultyOverheadRate,
    };
    const budgetId = d1Id("budget");
    const versionId = d1Id("budget-version");
    const database = d1Database();
    await runD1Batch([
      database.prepare(`
        INSERT INTO "CohortBudget" (
          "id", "programId", "cohortName", "startYear", "startSemester", "durationSemesters",
          "initialStudents", "status", "workflowStage", "facultyOverheadRate",
          "enrollmentRecognitionRate", "authorizedInitialCarryover", "includeAuthorizedCarryover",
          "normalizeSharedCosts", "alertPotentialDuplicates", "appliedTemplateId",
          "appliedTemplateVersion", "notes", "responsibleId", "createdAt", "updatedAt"
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'BORRADOR', 'GESTION', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).bind(
        budgetId,
        effectiveInput.programId,
        effectiveInput.cohortName,
        effectiveInput.startYear,
        effectiveInput.startSemester,
        effectiveInput.durationSemesters,
        effectiveInput.initialStudents,
        effectiveInput.facultyOverheadRate,
        effectiveInput.enrollmentRecognitionRate,
        effectiveInput.authorizedInitialCarryover,
        effectiveInput.includeAuthorizedCarryover ? 1 : 0,
        effectiveInput.normalizeSharedCosts ? 1 : 0,
        effectiveInput.alertPotentialDuplicates ? 1 : 0,
        effectiveInput.appliedTemplateId ?? null,
        effectiveInput.appliedTemplateVersion ?? null,
        effectiveInput.notes ?? null,
        effectiveInput.responsibleId,
      ),
      database.prepare(`
        INSERT INTO "BudgetVersion" (
          "id", "budgetId", "number", "status", "snapshot", "changeNote", "createdAt"
        ) VALUES (?, ?, 1, 'BORRADOR', ?, 'Creación inicial', CURRENT_TIMESTAMP)
      `).bind(versionId, budgetId, d1Json(effectiveInput)),
      database.prepare(`
        INSERT INTO "AuditLog" (
          "id", "userId", "budgetId", "versionId", "entity", "entityId", "action", "newValue", "createdAt"
        ) VALUES (?, ?, ?, ?, 'CohortBudget', ?, 'CREATE', ?, CURRENT_TIMESTAMP)
      `).bind(d1Id("audit"), identity.userId, budgetId, versionId, budgetId, d1Json(effectiveInput)),
    ]);
    const created = await prisma.cohortBudget.findUnique({
      where: { id: budgetId },
      include: { program: true, versions: true },
    });

    return Response.json(json(created), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
