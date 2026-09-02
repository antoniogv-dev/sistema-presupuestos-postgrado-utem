import { z, ZodError } from "zod";
import { apiError, hasAccess, requireApiIdentity } from "@/lib/auth/api-access";
import { d1Id, d1Json, runD1Batch } from "@/lib/database/d1-atomic";
import { getPrismaClient } from "@/lib/database/prisma";
import { templateTypeFromTuitionSource, tuitionSourceFromDatabase } from "@/lib/programs/tuition-source";
import { d1Database } from "@/lib/runtime-env";

const programSchema = z.object({
  code: z.string().trim().min(2).max(30).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(3).max(240),
  type: z.enum(["DOCTORADO", "MAGISTER_ACADEMICO", "MAGISTER_PROFESIONAL", "OTRO"]),
  faculty: z.string().trim().min(2).max(240),
  director: z.string().trim().min(2).max(200),
  officialDurationSemesters: z.number().int().min(1).max(16),
  status: z.enum(["ACTIVO", "INACTIVO", "EN_DISENO"]),
  costCenter: z.string().trim().max(100).optional().nullable(),
  versionLabel: z.string().trim().min(1).max(80),
});


const curriculumCourseSchema = z.object({
  id: z.string().optional(),
  code: z.string().trim().max(50).optional().nullable(),
  name: z.string().trim().min(2).max(300),
  semester: z.number().int().min(1).max(16),
  kind: z.enum(["OBLIGATORIA", "ELECTIVA", "ESPECIALIZACION", "GRADUACION", "COMPETENCIA_GENERICA"]),
  weeks: z.number().int().min(1).max(30).default(18),
  sections: z.number().int().min(1).max(20).default(1),
  theoryWeeklyHours: z.number().min(0).max(100).default(0),
  laboratoryWeeklyHours: z.number().min(0).max(100).default(0),
  workshopWeeklyHours: z.number().min(0).max(100).default(0),
  directWeeklyHours: z.number().min(0).max(100).default(0),
  autonomousWeeklyHours: z.number().min(0).max(200).default(0),
  teachingMode: z.enum(["PRESENCIAL", "SINCRONICA", "ASINCRONICA"]).default("SINCRONICA"),
  asynchronousRateFactor: z.number().min(0).max(1).default(0.5),
  sharedWithProgramIds: z.array(z.string()).max(50).default([]),
  allocationRate: z.number().min(0).max(1).default(1),
  sctCredits: z.number().min(0).max(100).default(0),
  prerequisites: z.string().trim().max(500).optional().nullable(),
  position: z.number().int().min(0).max(500).default(0),
});

const tuitionSourceSchema = z.enum([
  "PROPIO",
  "PLANTILLA_DOCTORADO",
  "PLANTILLA_MAGISTER_ACADEMICO",
  "PLANTILLA_MAGISTER_PROFESIONAL",
]);

const updateProgramSchema = programSchema.extend({
  annualTuitions: z.array(z.object({
    year: z.number().int().min(2000).max(2100),
    amount: z.number().int().nonnegative(),
    source: tuitionSourceSchema.default("PROPIO"),
  })).max(30).optional(),
  curriculumCourses: z.array(curriculumCourseSchema).max(120).optional(),
});

type RouteContext = { params: Promise<{ programId: string }> };

function json(value: unknown) {
  return JSON.parse(JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item));
}

export async function GET(request: Request, context: RouteContext) {
  try {
    await requireApiIdentity(request);
    const { programId } = await context.params;
    const program = await getPrismaClient().program.findUnique({
      where: { id: programId },
      include: { annualTuitions: { orderBy: { year: "asc" } }, curriculumCourses: { orderBy: [{ semester: "asc" }, { position: "asc" }] }, intakeWindows: { orderBy: { displayOrder: "asc" } } },
    });
    if (!program) throw new Error("NOT_FOUND");
    return Response.json(json({
      ...program,
      annualTuitions: program.annualTuitions.map((tuition) => ({
        ...tuition,
        source: tuitionSourceFromDatabase(tuition.source, tuition.templateType),
      })),
    }));
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const identity = await requireApiIdentity(request);
    if (!hasAccess(identity, "GESTOR")) throw new Error("FORBIDDEN");
    const { programId } = await context.params;
    const input = updateProgramSchema.parse(await request.json());
    const prisma = getPrismaClient();
    const current = await prisma.program.findUnique({ where: { id: programId } });
    if (!current) throw new Error("NOT_FOUND");
    const duplicate = await prisma.program.findFirst({ where: { code: input.code, id: { not: programId } }, select: { id: true } });
    if (duplicate) throw new Error("CONFLICT");

    const database = d1Database();
    const statements: D1PreparedStatement[] = [
      database.prepare(`
        UPDATE "Program"
        SET "code" = ?, "name" = ?, "type" = ?, "faculty" = ?, "director" = ?,
            "officialDurationSemesters" = ?, "status" = ?, "costCenter" = ?, "versionLabel" = ?, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ?
      `).bind(
        input.code,
        input.name,
        input.type,
        input.faculty,
        input.director,
        input.officialDurationSemesters,
        input.status,
        input.costCenter || null,
        input.versionLabel,
        programId,
      ),
    ];

    if (input.curriculumCourses) {
      statements.push(database.prepare(`DELETE FROM "ProgramCourse" WHERE "programId" = ?`).bind(programId));
      for (const [position, course] of input.curriculumCourses.entries()) {
        statements.push(database.prepare(`
          INSERT INTO "ProgramCourse" (
            "id","programId","code","name","semester","kind","weeks","sections",
            "theoryWeeklyHours","laboratoryWeeklyHours","workshopWeeklyHours","directWeeklyHours","autonomousWeeklyHours",
            "teachingMode","asynchronousRateFactor","sharedWithProgramIds","allocationRate","sctCredits","prerequisites","position","createdAt","updatedAt"
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        `).bind(
          course.id || d1Id("course"), programId, course.code || null, course.name, course.semester, course.kind, course.weeks, (course.kind === "OBLIGATORIA" || course.kind === "COMPETENCIA_GENERICA") ? 1 : course.sections,
          course.theoryWeeklyHours, course.laboratoryWeeklyHours, course.workshopWeeklyHours, course.directWeeklyHours, 0,
          course.teachingMode, course.asynchronousRateFactor, d1Json(course.sharedWithProgramIds), course.allocationRate, course.sctCredits, course.prerequisites || null, position,
        ));
      }
    }

    for (const tuition of input.annualTuitions ?? []) {
      const templateType = templateTypeFromTuitionSource(tuition.source);
      const databaseSource = tuition.source === "PROPIO" ? "PROPIO" : "PLANTILLA_DOCTORADO";
      statements.push(database.prepare(`
        INSERT INTO "ProgramAnnualTuition" (
          "id", "programId", "year", "amount", "source", "templateType", "createdAt", "updatedAt"
        ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT("programId", "year") DO UPDATE SET
          "amount" = excluded."amount",
          "source" = excluded."source",
          "templateType" = excluded."templateType",
          "updatedAt" = CURRENT_TIMESTAMP
      `).bind(
        d1Id("tuition"),
        programId,
        tuition.year,
        tuition.amount,
        databaseSource,
        templateType,
      ));
    }

    statements.push(database.prepare(`
      INSERT INTO "AuditLog" (
        "id", "userId", "entity", "entityId", "action", "previousValue", "newValue", "createdAt"
      ) VALUES (?, ?, 'Program', ?, 'UPDATE_PROGRAM', ?, ?, CURRENT_TIMESTAMP)
    `).bind(d1Id("audit"), identity.userId, programId, d1Json(current), d1Json(input)));

    await runD1Batch(statements);

    const updated = await prisma.program.findUnique({
      where: { id: programId },
      include: { annualTuitions: { orderBy: { year: "asc" } }, curriculumCourses: { orderBy: [{ semester: "asc" }, { position: "asc" }] }, intakeWindows: { orderBy: { displayOrder: "asc" } } },
    });
    return Response.json(json(updated ? {
      ...updated,
      annualTuitions: updated.annualTuitions.map((tuition) => ({
        ...tuition,
        source: tuitionSourceFromDatabase(tuition.source, tuition.templateType),
      })),
    } : null));
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: "Datos del programa inválidos.", issues: error.issues }, { status: 400 });
    }
    return apiError(error);
  }
}
