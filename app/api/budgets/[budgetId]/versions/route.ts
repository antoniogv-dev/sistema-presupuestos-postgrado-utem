import { apiError, requireApiIdentity } from "@/lib/auth/api-access";
import { getPrismaClient } from "@/lib/database/prisma";

function json(value: unknown) {
  return JSON.parse(JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item));
}

type RouteContext = { params: Promise<{ budgetId: string }> };
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: RouteContext) {
  try {
    await requireApiIdentity(request);
    const { budgetId } = await context.params;
    const budget = await getPrismaClient().cohortBudget.findFirst({
      where: { id: budgetId, deletedAt: null },
      select: {
        id: true,
        cohortName: true,
        program: { select: { code: true, name: true } },
        versions: { orderBy: { number: "desc" } },
      },
    });
    if (!budget) throw new Error("NOT_FOUND");
    return Response.json(json({
      id: budget.id,
      cohortName: budget.cohortName,
      program: budget.program,
      versions: budget.versions.map((version) => ({
        id: version.id,
        number: version.number,
        status: version.status,
        snapshot: version.snapshot,
        changeNote: version.changeNote,
        createdAt: version.createdAt,
      })),
    }));
  } catch (error) {
    return apiError(error);
  }
}
