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
      include: { annualTuitions: { orderBy: { year: "asc" } } },
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
            "officialDurationSemesters" = ?, "status" = ?, "costCenter" = ?, "updatedAt" = CURRENT_TIMESTAMP
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
        programId,
      ),
    ];

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
      include: { annualTuitions: { orderBy: { year: "asc" } } },
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
