import { apiError, requireApiIdentity } from "@/lib/auth/api-access";
import { getPrismaClient } from "@/lib/database/prisma";

function json(value: unknown) {
  return JSON.parse(JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item));
}

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireApiIdentity(request);
    const programs = await getPrismaClient().program.findMany({
      where: { status: { not: "INACTIVO" } },
      include: { annualTuitions: { orderBy: { year: "asc" } } },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    });
    return Response.json(json(programs));
  } catch (error) {
    return apiError(error);
  }
}
