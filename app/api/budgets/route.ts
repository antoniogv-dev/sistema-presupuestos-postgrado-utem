import { ProgramType } from "@prisma/client";
import { z } from "zod";
import { apiError, hasAnyAccess, requireApiIdentity } from "@/lib/auth/api-access";
import { d1Id, d1Json, runD1Batch } from "@/lib/database/d1-atomic";
import { getPrismaClient } from "@/lib/database/prisma";
import { d1Database } from "@/lib/runtime-env";

const annualOverrideSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  directTeachingHourValue: z.number().nonnegative(),
  synchronousTeachingHourValue: z.number().nonnegative().default(0),
  asynchronousTeachingHourValue: z.number().nonnegative().default(0),
  maintenanceScholarshipMonthlyValue: z.number().int().nonnegative().default(0),
  annualEnrollmentFee: z.number().int().nonnegative(),
  annualTuition: z.number().int().positive(),
  thesisGuidancePerGraduatingStudent: z.number().int().nonnegative(),
  annualDirection: z.number().int().nonnegative(),
  directionProrated: z.boolean().default(false),
  directionAllocationRate: z.number().min(0).max(1).default(1),
  annualAssistance: z.number().int().nonnegative(),
  assistanceProrated: z.boolean().default(false),
  assistanceAllocationRate: z.number().min(0).max(1).default(1),
  annualOtherNonAcademicHonoraria: z.number().int().nonnegative(),
  otherNonAcademicProrated: z.boolean().default(false),
  otherNonAcademicAllocationRate: z.number().min(0).max(1).default(1),
  annualOperational: z.number().int().nonnegative(),
  annualSoftware: z.number().int().nonnegative(),
  annualDiffusion: z.number().int().nonnegative(),
  annualCongressesInternships: z.number().int().nonnegative(),
  annualBooksPublications: z.number().int().nonnegative(),
  annualTravelFreight: z.number().int().nonnegative(),
  annualPerDiem: z.number().int().nonnegative(),
  annualFoodBeverages: z.number().int().nonnegative(),
  annualOtherCosts: z.number().int().nonnegative(),
  centralOverheadRate: z.number().min(0).max(1).default(0),
  facultyOverheadRate: z.number().min(0).max(1).default(0),
});

const createSchema = z.object({
  programId: z.string().min(1),
  cohortName: z.string().trim().min(3),
  startYear: z.number().int().min(2000).max(2100),
  startSemester: z.union([z.literal(1), z.literal(2)]),
  durationSemesters: z.number().int().min(2).max(8),
  initialStudents: z.number().int().min(0),
  facultyOverheadRate: z.number().min(0).max(1),
  enrollmentRecognitionRate: z.number().min(0).max(1).default(0),
  badDebtRate: z.number().min(0).max(1).optional().nullable(),
  programVersionLabel: z.string().trim().min(1).max(80).optional(),
  scholarshipsEnabled: z.boolean().optional(),
  deliveryModality: z.enum(["PRESENCIAL", "SEMIPRESENCIAL", "E_LEARNING"]).default("PRESENCIAL"),
  annualOverrides: z.array(annualOverrideSchema).max(20).optional(),
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

function appendAnnualOverrides(
  statements: D1PreparedStatement[],
  budgetId: string,
  annualOverrides: z.infer<typeof annualOverrideSchema>[],
) {
  const database = d1Database();
  for (const item of annualOverrides) {
    statements.push(database.prepare(`
      INSERT INTO "BudgetAnnualOverride" (
        "id", "budgetId", "year", "directTeachingHourValue", "synchronousTeachingHourValue", "asynchronousTeachingHourValue", "maintenanceScholarshipMonthlyValue", "annualEnrollmentFee", "annualTuition",
        "thesisGuidancePerGraduatingStudent", "annualDirection", "directionProrated",
        "directionAllocationRate", "annualAssistance", "assistanceProrated",
        "assistanceAllocationRate", "annualOtherNonAcademicHonoraria", "otherNonAcademicProrated",
        "otherNonAcademicAllocationRate", "annualOperational", "annualSoftware", "annualDiffusion",
        "annualCongressesInternships", "annualBooksPublications", "annualTravelFreight", "annualPerDiem",
        "annualFoodBeverages", "annualOtherCosts", "centralOverheadRate", "facultyOverheadRate"
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      d1Id("annual-override"), budgetId, item.year, item.directTeachingHourValue,
      item.synchronousTeachingHourValue, item.asynchronousTeachingHourValue, item.maintenanceScholarshipMonthlyValue,
      item.annualEnrollmentFee, item.annualTuition, item.thesisGuidancePerGraduatingStudent, item.annualDirection,
      item.directionProrated ? 1 : 0, item.directionAllocationRate, item.annualAssistance,
      item.assistanceProrated ? 1 : 0, item.assistanceAllocationRate,
      item.annualOtherNonAcademicHonoraria, item.otherNonAcademicProrated ? 1 : 0,
      item.otherNonAcademicAllocationRate, item.annualOperational, item.annualSoftware, item.annualDiffusion,
      item.annualCongressesInternships, item.annualBooksPublications, item.annualTravelFreight, item.annualPerDiem,
      item.annualFoodBeverages, item.annualOtherCosts, item.centralOverheadRate, item.facultyOverheadRate,
    ));
  }
}

export async function GET(request: Request) {
  try {
    await requireApiIdentity(request);
    const budgets = await getPrismaClient().cohortBudget.findMany({
      where: { deletedAt: null },
      include: {
        program: { include: { annualTuitions: { orderBy: { year: "asc" } }, curriculumCourses: { orderBy: [{ semester: "asc" }, { position: "asc" }] } } },
        appliedTemplate: true,
        responsible: { select: { id: true, name: true, email: true } },
        semesterPeriods: { include: { parameters: true }, orderBy: { position: "asc" } },
        discounts: true,
        externalIncome: true,
        items: true,
        annualOverrides: { orderBy: { year: "asc" } },
        sharedCourses: { orderBy: [{ year: "asc" }, { semester: "asc" }] },
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
    const program = await prisma.program.findUnique({
      where: { id: input.programId },
      select: { id: true, code: true, type: true, versionLabel: true },
    });
    if (!program) throw new Error("NOT_FOUND");
    const cohortPrefix = input.cohortName.trim().split(/[\s·|/]+/)[0]?.toUpperCase() ?? "";
    if (cohortPrefix) {
      const programCodes = await prisma.program.findMany({ select: { id: true, code: true } });
      const prefixProgram = programCodes.find((candidate) => candidate.code.toUpperCase() === cohortPrefix);
      if (prefixProgram && prefixProgram.id !== program.id) throw new Error("COHORT_PROGRAM_MISMATCH");
    }
    if (input.appliedTemplateId) {
      const template = await prisma.budgetTemplate.findUnique({
        where: { id: input.appliedTemplateId },
        select: { programType: true, programId: true, active: true },
      });
      if (!template || !template.active || template.programType !== program.type || (template.programId && template.programId !== program.id)) {
        throw new Error("TEMPLATE_PROGRAM_MISMATCH");
      }
    }

    const effectiveInput = {
      ...input,
      facultyOverheadRate: isAcademic(program.type) ? 0 : input.facultyOverheadRate,
      enrollmentRecognitionRate: input.enrollmentRecognitionRate ?? 0,
      badDebtRate: input.badDebtRate ?? null,
      programVersionLabel: input.programVersionLabel?.trim() || program.versionLabel || "1",
      scholarshipsEnabled: input.scholarshipsEnabled ?? (program.type !== ProgramType.MAGISTER_PROFESIONAL),
      deliveryModality: input.deliveryModality ?? "PRESENCIAL",
    };
    const budgetId = d1Id("budget");
    const versionId = d1Id("budget-version");
    const database = d1Database();
    const statements: D1PreparedStatement[] = [
      database.prepare(`
        INSERT INTO "CohortBudget" (
          "id", "programId", "cohortName", "startYear", "startSemester", "durationSemesters",
          "initialStudents", "status", "workflowStage", "facultyOverheadRate",
          "enrollmentRecognitionRate", "badDebtRate", "programVersionLabel", "scholarshipsEnabled", "deliveryModality",
          "authorizedInitialCarryover", "includeAuthorizedCarryover", "normalizeSharedCosts",
          "alertPotentialDuplicates", "appliedTemplateId", "appliedTemplateVersion", "notes",
          "responsibleId", "createdAt", "updatedAt"
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'BORRADOR', 'GESTION', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).bind(
        budgetId, effectiveInput.programId, effectiveInput.cohortName, effectiveInput.startYear,
        effectiveInput.startSemester, effectiveInput.durationSemesters, effectiveInput.initialStudents,
        effectiveInput.facultyOverheadRate, effectiveInput.enrollmentRecognitionRate, effectiveInput.badDebtRate,
        effectiveInput.programVersionLabel, effectiveInput.scholarshipsEnabled ? 1 : 0, effectiveInput.deliveryModality,
        effectiveInput.authorizedInitialCarryover, effectiveInput.includeAuthorizedCarryover ? 1 : 0,
        effectiveInput.normalizeSharedCosts ? 1 : 0, effectiveInput.alertPotentialDuplicates ? 1 : 0,
        effectiveInput.appliedTemplateId ?? null, effectiveInput.appliedTemplateVersion ?? null,
        effectiveInput.notes ?? null, effectiveInput.responsibleId,
      ),
    ];
    appendAnnualOverrides(statements, budgetId, effectiveInput.annualOverrides ?? []);
    statements.push(
      database.prepare(`
        INSERT INTO "BudgetVersion" ("id", "budgetId", "number", "status", "snapshot", "changeNote", "createdAt")
        VALUES (?, ?, 1, 'BORRADOR', ?, 'Creación inicial', CURRENT_TIMESTAMP)
      `).bind(versionId, budgetId, d1Json(effectiveInput)),
      database.prepare(`
        INSERT INTO "AuditLog" ("id", "userId", "budgetId", "versionId", "entity", "entityId", "action", "newValue", "createdAt")
        VALUES (?, ?, ?, ?, 'CohortBudget', ?, 'CREATE', ?, CURRENT_TIMESTAMP)
      `).bind(d1Id("audit"), identity.userId, budgetId, versionId, budgetId, d1Json(effectiveInput)),
    );
    await runD1Batch(statements);

    const created = await prisma.cohortBudget.findUnique({
      where: { id: budgetId },
      include: {
        program: { include: { annualTuitions: { orderBy: { year: "asc" } }, curriculumCourses: { orderBy: [{ semester: "asc" }, { position: "asc" }] } } },
        annualOverrides: { orderBy: { year: "asc" } },
        sharedCourses: { orderBy: [{ year: "asc" }, { semester: "asc" }] },
        versions: { orderBy: { number: "desc" }, take: 1 },
      },
    });
    return Response.json(json(created), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
