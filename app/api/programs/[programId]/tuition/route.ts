import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { apiError, hasAccess, requireApiIdentity } from "@/lib/auth/api-access";
import { d1Id, d1Json, runD1Batch } from "@/lib/database/d1-atomic";
import { getPrismaClient } from "@/lib/database/prisma";
import { templateTypeFromTuitionSource, tuitionSourceFromDatabase } from "@/lib/programs/tuition-source";
import { d1Database } from "@/lib/runtime-env";

const tuitionSourceSchema = z.enum([
  "PROPIO",
  "PLANTILLA_DOCTORADO",
  "PLANTILLA_MAGISTER_ACADEMICO",
  "PLANTILLA_MAGISTER_PROFESIONAL",
]);

const tuitionPayload = z.object({
  values: z.array(z.object({
    year: z.number().int().min(2000).max(2100),
    amount: z.number().int().nonnegative(),
    source: tuitionSourceSchema.default("PROPIO"),
  })).min(1),
});

type RouteContext = { params: Promise<{ programId: string }> };
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: RouteContext) {
  try {
    await requireApiIdentity(request);
    const { programId } = await context.params;
    const program = await getPrismaClient().program.findUnique({
      where: { id: programId },
      select: { id: true, code: true, name: true, annualTuitions: { orderBy: { year: "asc" } } },
    });
    if (!program) throw new Error("NOT_FOUND");
    return NextResponse.json({
      ...program,
      annualTuitions: program.annualTuitions.map((value) => ({
        ...value,
        amount: Number(value.amount),
        source: tuitionSourceFromDatabase(value.source, value.templateType),
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const identity = await requireApiIdentity(request);
    if (!hasAccess(identity, "GESTOR")) throw new Error("FORBIDDEN");
    const { programId } = await context.params;
    const payload = tuitionPayload.parse(await request.json());
    const prisma = getPrismaClient();
    const exists = await prisma.program.findUnique({ where: { id: programId }, select: { id: true } });
    if (!exists) throw new Error("NOT_FOUND");

    const database = d1Database();
    const statements: D1PreparedStatement[] = payload.values.map((value) => {
      const templateType = templateTypeFromTuitionSource(value.source);
      const databaseSource = value.source === "PROPIO" ? "PROPIO" : "PLANTILLA_DOCTORADO";
      return database.prepare(`
        INSERT INTO "ProgramAnnualTuition" (
          "id", "programId", "year", "amount", "source", "templateType", "createdAt", "updatedAt"
        ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT("programId", "year") DO UPDATE SET
          "amount" = excluded."amount",
          "source" = excluded."source",
          "templateType" = excluded."templateType",
          "updatedAt" = CURRENT_TIMESTAMP
      `).bind(d1Id("tuition"), programId, value.year, value.amount, databaseSource, templateType);
    });
    statements.push(
      database.prepare(`
        INSERT INTO "AuditLog" (
          "id", "userId", "entity", "entityId", "action", "newValue", "createdAt"
        ) VALUES (?, ?, 'ProgramAnnualTuition', ?, 'UPSERT_PROGRAM_TUITION', ?, CURRENT_TIMESTAMP)
      `).bind(d1Id("audit"), identity.userId, programId, d1Json(payload.values)),
    );
    await runD1Batch(statements);

    return NextResponse.json({ message: "Aranceles del programa actualizados.", values: payload.values });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Datos de arancel inválidos.", issues: error.issues }, { status: 400 });
    }
    return apiError(error);
  }
}
