import { z, ZodError } from "zod";
import { apiError, hasAnyAccess, requireApiIdentity } from "@/lib/auth/api-access";
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
  status: z.enum(["ACTIVO", "INACTIVO", "EN_DISENO"]).default("ACTIVO"),
  costCenter: z.string().trim().max(100).optional().nullable(),
  versionLabel: z.string().trim().min(1).max(80).default("1"),
});


const curriculumCourseSchema = z.object({
  id: z.string().optional(),
  code: z.string().trim().max(50).optional().nullable(),
  name: z.string().trim().min(2).max(300),
  semester: z.number().int().min(1).max(16),
  kind: z.enum(["OBLIGATORIA", "ELECTIVA", "ESPECIALIZACION", "COMPETENCIA_GENERICA"]),
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

const createProgramSchema = programSchema.extend({
  annualTuitions: z.array(z.object({
    year: z.number().int().min(2000).max(2100),
    amount: z.number().int().nonnegative(),
    source: tuitionSourceSchema.default("PROPIO"),
  })).max(30).optional(),
  curriculumCourses: z.array(curriculumCourseSchema).min(1, "Debe incorporar al menos una asignatura o competencia genérica.").max(120),
});

function json(value: unknown) {
  return JSON.parse(JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item));
}

function apiProgram<T extends { annualTuitions?: Array<{ source: string; templateType?: string | null }> }>(program: T) {
  return {
    ...program,
    annualTuitions: program.annualTuitions?.map((tuition) => ({
      ...tuition,
      source: tuitionSourceFromDatabase(
        tuition.source,
        tuition.templateType as "DOCTORADO" | "MAGISTER_ACADEMICO" | "MAGISTER_PROFESIONAL" | "OTRO" | null | undefined,
      ),
    })),
  };
}

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireApiIdentity(request);
    const url = new URL(request.url);
    const includeInactive = url.searchParams.get("includeInactive") === "1";
    const programs = await getPrismaClient().program.findMany({
      where: includeInactive ? undefined : { status: { not: "INACTIVO" } },
      include: { annualTuitions: { orderBy: { year: "asc" } }, curriculumCourses: { orderBy: [{ semester: "asc" }, { position: "asc" }] } },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    });
    return Response.json(json(programs.map(apiProgram)));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireApiIdentity(request);
    if (!hasAnyAccess(identity, ["CREADOR", "GESTOR"])) throw new Error("FORBIDDEN");
    const input = createProgramSchema.parse(await request.json());
    const prisma = getPrismaClient();
    const duplicate = await prisma.program.findUnique({ where: { code: input.code }, select: { id: true } });
    if (duplicate) throw new Error("CONFLICT");

    const programId = d1Id("program");
    const database = d1Database();
    const statements: D1PreparedStatement[] = [
      database.prepare(`
        INSERT INTO "Program" (
          "id", "code", "name", "type", "faculty", "director", "officialDurationSemesters",
          "status", "costCenter", "versionLabel", "createdAt", "updatedAt"
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).bind(
        programId,
        input.code,
        input.name,
        input.type,
        input.faculty,
        input.director,
        input.officialDurationSemesters,
        input.status,
        input.costCenter || null,
        input.versionLabel,
      ),
    ];

    for (const [position, course] of input.curriculumCourses.entries()) {
      statements.push(database.prepare(`
        INSERT INTO "ProgramCourse" (
          "id","programId","code","name","semester","kind","weeks","sections",
          "theoryWeeklyHours","laboratoryWeeklyHours","workshopWeeklyHours","directWeeklyHours","autonomousWeeklyHours",
          "teachingMode","asynchronousRateFactor","sharedWithProgramIds","allocationRate","sctCredits","prerequisites","position","createdAt","updatedAt"
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      `).bind(
        d1Id("course"), programId, course.code || null, course.name, course.semester, course.kind, course.weeks, (course.kind === "OBLIGATORIA" || course.kind === "COMPETENCIA_GENERICA") ? 1 : course.sections,
        course.theoryWeeklyHours, course.laboratoryWeeklyHours, course.workshopWeeklyHours, course.directWeeklyHours, course.autonomousWeeklyHours,
        course.teachingMode, course.asynchronousRateFactor, d1Json(course.sharedWithProgramIds), course.allocationRate, course.sctCredits, course.prerequisites || null, position,
      ));
    }

    for (const tuition of input.annualTuitions ?? []) {
      const templateType = templateTypeFromTuitionSource(tuition.source);
      const databaseSource = tuition.source === "PROPIO" ? "PROPIO" : "PLANTILLA_DOCTORADO";
      statements.push(database.prepare(`
        INSERT INTO "ProgramAnnualTuition" (
          "id", "programId", "year", "amount", "source", "templateType", "createdAt", "updatedAt"
        ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
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
      INSERT INTO "AuditLog" ("id", "userId", "entity", "entityId", "action", "newValue", "createdAt")
      VALUES (?, ?, 'Program', ?, 'CREATE_PROGRAM', ?, CURRENT_TIMESTAMP)
    `).bind(d1Id("audit"), identity.userId, programId, d1Json(input)));

    // D1 batch es transaccional: programa, aranceles y auditoría se confirman o revierten juntos.
    await runD1Batch(statements);

    const created = await prisma.program.findUnique({
      where: { id: programId },
      include: { annualTuitions: { orderBy: { year: "asc" } }, curriculumCourses: { orderBy: [{ semester: "asc" }, { position: "asc" }] } },
    });
    return Response.json(json(created ? apiProgram(created) : null), { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: "Datos del programa inválidos.", issues: error.issues }, { status: 400 });
    }
    return apiError(error);
  }
}
