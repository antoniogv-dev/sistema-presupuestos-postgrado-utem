import { BudgetStatus, ProgramType } from "@prisma/client";
import { z } from "zod";
import { apiError, hasAccess, requireApiIdentity } from "@/lib/auth/api-access";
import { d1Id, d1Json, runD1Batch } from "@/lib/database/d1-atomic";
import { getPrismaClient } from "@/lib/database/prisma";
import { d1Database } from "@/lib/runtime-env";

const semesterSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  semester: z.union([z.literal(1), z.literal(2)]),
  position: z.number().int().min(0),
  activeStudents: z.number().int().min(0),
  graduatingStudents: z.number().int().min(0),
  directTeachingHours: z.number().min(0),
  replacementTeachingHours: z.number().min(0),
  electiveSubjects: z.number().int().min(0).default(0),
  electiveSections: z.number().int().min(0).default(0),
  specializedCourses: z.number().int().min(0).default(0),
  specializedSections: z.number().int().min(0).default(0),
  internalTuitionScholarshipStudents: z.number().int().min(0).default(0),
  internalTuitionScholarshipCoverage: z.number().min(0).max(1).default(1),
  maintenanceScholarshipStudents: z.number().int().min(0).default(0),
  maintenanceScholarshipMonths: z.number().int().min(0).default(0),
  notes: z.string().nullable().optional(),
});
const discountSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  percentage: z.number().min(0).max(1),
  students: z.number().int().min(0),
  startYear: z.number().int(),
  startSemester: z.union([z.literal(1), z.literal(2)]),
  endYear: z.number().int(),
  endSemester: z.union([z.literal(1), z.literal(2)]),
  note: z.string().optional(),
  originTemplateItemKey: z.string().optional(),
});
const incomeSchema = z.object({
  id: z.string().optional(),
  type: z.string().min(1),
  description: z.string().min(1),
  year: z.number().int(),
  semester: z.union([z.literal(1), z.literal(2)]),
  students: z.number().int().min(0),
  amountPerStudent: z.number().int().min(0),
  source: z.string(),
  note: z.string().optional(),
  originTemplateItemKey: z.string().optional(),
});
const itemSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  description: z.string(),
  category: z.string().min(1),
  year: z.number().int(),
  semester: z.union([z.literal(1), z.literal(2)]).optional(),
  amount: z.number().int().min(0),
  costType: z.enum(["Único de esta versión", "Compartido con otras cohortes"]),
  periodicity: z.enum(["Único", "Semestral", "Anual"]),
  note: z.string().optional(),
  originTemplateItemKey: z.string().optional(),
});
const updateSchema = z.object({
  programId: z.string().min(1).optional(),
  cohortName: z.string().trim().min(3).optional(),
  startYear: z.number().int().min(2000).max(2100).optional(),
  startSemester: z.union([z.literal(1), z.literal(2)]).optional(),
  durationSemesters: z.number().int().min(2).max(8).optional(),
  initialStudents: z.number().int().min(0).optional(),
  facultyOverheadRate: z.number().min(0).max(1).optional(),
  enrollmentRecognitionRate: z.number().min(0).max(1).optional(),
  authorizedInitialCarryover: z.number().int().optional(),
  includeAuthorizedCarryover: z.boolean().optional(),
  normalizeSharedCosts: z.boolean().optional(),
  alertPotentialDuplicates: z.boolean().optional(),
  appliedTemplateId: z.string().nullable().optional(),
  appliedTemplateVersion: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional(),
  changeNote: z.string().trim().max(500).optional(),
  semesters: z.array(semesterSchema).max(8).optional(),
  discounts: z.array(discountSchema).optional(),
  externalIncome: z.array(incomeSchema).optional(),
  items: z.array(itemSchema).optional(),
});

function json(value: unknown) {
  return JSON.parse(JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item));
}
function isAcademic(type: ProgramType) {
  return type === ProgramType.DOCTORADO || type === ProgramType.MAGISTER_ACADEMICO;
}
const includeAll = {
  program: { include: { annualTuitions: { orderBy: { year: "asc" as const } } } },
  appliedTemplate: true,
  responsible: { select: { id: true, name: true, email: true } },
  semesterPeriods: { include: { parameters: true }, orderBy: { position: "asc" as const } },
  discounts: true,
  externalIncome: true,
  items: true,
  versions: { orderBy: { number: "desc" as const } },
  approvals: { orderBy: { createdAt: "desc" as const } },
  workflowEvents: {
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "asc" as const },
  },
};

export async function GET(request: Request, context: { params: Promise<{ budgetId: string }> }) {
  try {
    await requireApiIdentity(request);
    const { budgetId } = await context.params;
    const budget = await getPrismaClient().cohortBudget.findFirst({
      where: { id: budgetId, deletedAt: null },
      include: includeAll,
    });
    if (!budget) throw new Error("NOT_FOUND");
    return Response.json(json(budget));
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request, context: { params: Promise<{ budgetId: string }> }) {
  try {
    const identity = await requireApiIdentity(request);
    if (!hasAccess(identity, "GESTOR")) throw new Error("FORBIDDEN");
    const { budgetId } = await context.params;
    const input = updateSchema.parse(await request.json());
    const prisma = getPrismaClient();
    const current = await prisma.cohortBudget.findFirst({
      where: { id: budgetId, deletedAt: null },
      include: {
        program: { select: { type: true } },
        versions: { orderBy: { number: "desc" }, take: 1 },
      },
    });
    if (!current) throw new Error("NOT_FOUND");
    if (current.workflowStage !== "GESTION" || current.status === "APROBADO") throw new Error("INVALID_STAGE");

    const effectiveProgram = input.programId && input.programId !== current.programId
      ? await prisma.program.findUnique({ where: { id: input.programId }, select: { type: true } })
      : current.program;
    if (!effectiveProgram) throw new Error("NOT_FOUND");

    const { semesters, discounts, externalIncome, items, changeNote, ...header } = input;
    const nextVersion = (current.versions[0]?.number ?? 0) + 1;
    const nextStatus = current.status === BudgetStatus.OBSERVADO ? BudgetStatus.BORRADOR : current.status;
    const database = d1Database();
    const statements: D1PreparedStatement[] = [];
    const assignments: string[] = [];
    const values: D1Value[] = [];
    const assign = (column: string, value: D1Value) => {
      assignments.push(`"${column}" = ?`);
      values.push(value);
    };

    if (header.programId !== undefined) assign("programId", header.programId);
    if (header.cohortName !== undefined) assign("cohortName", header.cohortName);
    if (header.startYear !== undefined) assign("startYear", header.startYear);
    if (header.startSemester !== undefined) assign("startSemester", header.startSemester);
    if (header.durationSemesters !== undefined) assign("durationSemesters", header.durationSemesters);
    if (header.initialStudents !== undefined) assign("initialStudents", header.initialStudents);
    if (isAcademic(effectiveProgram.type)) assign("facultyOverheadRate", 0);
    else if (header.facultyOverheadRate !== undefined) assign("facultyOverheadRate", header.facultyOverheadRate);
    if (header.enrollmentRecognitionRate !== undefined) assign("enrollmentRecognitionRate", header.enrollmentRecognitionRate);
    if (header.authorizedInitialCarryover !== undefined) assign("authorizedInitialCarryover", header.authorizedInitialCarryover);
    if (header.includeAuthorizedCarryover !== undefined) assign("includeAuthorizedCarryover", header.includeAuthorizedCarryover ? 1 : 0);
    if (header.normalizeSharedCosts !== undefined) assign("normalizeSharedCosts", header.normalizeSharedCosts ? 1 : 0);
    if (header.alertPotentialDuplicates !== undefined) assign("alertPotentialDuplicates", header.alertPotentialDuplicates ? 1 : 0);
    if (header.appliedTemplateId !== undefined) assign("appliedTemplateId", header.appliedTemplateId);
    if (header.appliedTemplateVersion !== undefined) assign("appliedTemplateVersion", header.appliedTemplateVersion);
    if (header.notes !== undefined) assign("notes", header.notes);
    if (current.status === BudgetStatus.OBSERVADO) assign("status", BudgetStatus.BORRADOR);
    assignments.push('"updatedAt" = CURRENT_TIMESTAMP');

    statements.push(
      database.prepare(`UPDATE "CohortBudget" SET ${assignments.join(", ")} WHERE "id" = ?`)
        .bind(...values, budgetId),
    );

    if (semesters) {
      statements.push(database.prepare(`DELETE FROM "SemesterPeriod" WHERE "budgetId" = ?`).bind(budgetId));
      for (const semester of semesters) {
        const periodId = d1Id("semester");
        statements.push(
          database.prepare(`
            INSERT INTO "SemesterPeriod" ("id", "budgetId", "year", "semester", "position")
            VALUES (?, ?, ?, ?, ?)
          `).bind(periodId, budgetId, semester.year, semester.semester, semester.position),
          database.prepare(`
            INSERT INTO "SemesterParameters" (
              "id", "periodId", "activeStudents", "graduatingStudents", "directTeachingHours",
              "replacementTeachingHours", "electiveSubjects", "electiveSections", "specializedCourses",
              "specializedSections", "internalTuitionScholarshipStudents", "internalTuitionScholarshipCoverage",
              "maintenanceScholarshipStudents", "maintenanceScholarshipMonths", "notes"
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            d1Id("semester-parameters"),
            periodId,
            semester.activeStudents,
            semester.graduatingStudents,
            semester.directTeachingHours,
            semester.replacementTeachingHours,
            semester.electiveSubjects,
            semester.electiveSections,
            semester.specializedCourses,
            semester.specializedSections,
            semester.internalTuitionScholarshipStudents,
            semester.internalTuitionScholarshipCoverage,
            semester.maintenanceScholarshipStudents,
            semester.maintenanceScholarshipMonths,
            semester.notes ?? null,
          ),
        );
      }
    }

    if (discounts) {
      statements.push(
        database.prepare(`DELETE FROM "CohortDiscount" WHERE "budgetId" = ?`).bind(budgetId),
        database.prepare(`
          INSERT OR IGNORE INTO "DiscountType" ("id", "name", "active")
          VALUES ('discount-configurable', 'Descuento configurable', 1)
        `),
      );
      for (const discount of discounts) {
        statements.push(
          database.prepare(`
            INSERT INTO "CohortDiscount" (
              "id", "budgetId", "discountTypeId", "name", "percentage", "students",
              "startYear", "startSemester", "endYear", "endSemester", "note", "originTemplateItemKey"
            ) VALUES (?, ?, 'discount-configurable', ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            d1Id("discount"),
            budgetId,
            discount.name,
            discount.percentage,
            discount.students,
            discount.startYear,
            discount.startSemester,
            discount.endYear,
            discount.endSemester,
            discount.note ?? null,
            discount.originTemplateItemKey ?? null,
          ),
        );
      }
    }

    if (externalIncome) {
      statements.push(database.prepare(`DELETE FROM "ExternalIncome" WHERE "budgetId" = ?`).bind(budgetId));
      for (const income of externalIncome) {
        statements.push(
          database.prepare(`
            INSERT INTO "ExternalIncome" (
              "id", "budgetId", "type", "description", "year", "semester", "students",
              "amountPerStudent", "source", "note", "originTemplateItemKey"
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            d1Id("income"),
            budgetId,
            income.type,
            income.description,
            income.year,
            income.semester,
            income.students,
            income.amountPerStudent,
            income.source,
            income.note ?? null,
            income.originTemplateItemKey ?? null,
          ),
        );
      }
    }

    if (items) {
      statements.push(database.prepare(`DELETE FROM "BudgetItem" WHERE "budgetId" = ?`).bind(budgetId));
      for (const item of items) {
        statements.push(
          database.prepare(`
            INSERT INTO "BudgetItem" (
              "id", "budgetId", "name", "description", "category", "year", "semester", "amount",
              "costType", "periodicity", "note", "originTemplateItemKey"
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            d1Id("budget-item"),
            budgetId,
            item.name,
            item.description,
            item.category,
            item.year,
            item.semester ?? null,
            item.amount,
            item.costType === "Compartido con otras cohortes" ? "COMPARTIDO" : "PROPIO_COHORTE",
            item.periodicity,
            item.note ?? null,
            item.originTemplateItemKey ?? null,
          ),
        );
      }
    }

    const versionId = d1Id("budget-version");
    const snapshot = {
      budget: {
        ...json(current),
        ...header,
        facultyOverheadRate: isAcademic(effectiveProgram.type) ? 0 : (header.facultyOverheadRate ?? current.facultyOverheadRate),
        status: nextStatus,
      },
      semesters,
      discounts,
      externalIncome,
      items,
    };
    statements.push(
      database.prepare(`
        INSERT INTO "BudgetVersion" (
          "id", "budgetId", "number", "status", "snapshot", "changeNote", "createdAt"
        ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).bind(
        versionId,
        budgetId,
        nextVersion,
        nextStatus,
        d1Json(snapshot),
        changeNote || "Modificación del presupuesto",
      ),
      database.prepare(`
        INSERT INTO "AuditLog" (
          "id", "userId", "budgetId", "versionId", "entity", "entityId", "action",
          "previousValue", "newValue", "createdAt"
        ) VALUES (?, ?, ?, ?, 'CohortBudget', ?, 'UPDATE', ?, ?, CURRENT_TIMESTAMP)
      `).bind(
        d1Id("audit"),
        identity.userId,
        budgetId,
        versionId,
        budgetId,
        d1Json(current),
        d1Json(input),
      ),
    );

    await runD1Batch(statements);
    const record = await prisma.cohortBudget.findUnique({ where: { id: budgetId } });
    const version = await prisma.budgetVersion.findUnique({ where: { id: versionId } });
    if (!record || !version) throw new Error("NOT_FOUND");

    return Response.json(json({ ...record, version }));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ budgetId: string }> }) {
  try {
    const identity = await requireApiIdentity(request);
    const { budgetId } = await context.params;
    const prisma = getPrismaClient();
    const current = await prisma.cohortBudget.findFirst({ where: { id: budgetId, deletedAt: null } });
    if (!current) throw new Error("NOT_FOUND");
    const allowed = current.status === "APROBADO"
      ? hasAccess(identity, "APROBADOR")
      : hasAccess(identity, "GESTOR") && current.workflowStage === "GESTION";
    if (!allowed) throw new Error("FORBIDDEN");

    const database = d1Database();
    await runD1Batch([
      database.prepare(`
        UPDATE "CohortBudget"
        SET "deletedAt" = CURRENT_TIMESTAMP, "deletedById" = ?, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ?
      `).bind(identity.userId, budgetId),
      database.prepare(`
        INSERT INTO "AuditLog" (
          "id", "userId", "budgetId", "entity", "entityId", "action", "previousValue", "createdAt"
        ) VALUES (?, ?, ?, 'CohortBudget', ?, 'SOFT_DELETE', ?, CURRENT_TIMESTAMP)
      `).bind(d1Id("audit"), identity.userId, budgetId, budgetId, d1Json(current)),
    ]);
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
