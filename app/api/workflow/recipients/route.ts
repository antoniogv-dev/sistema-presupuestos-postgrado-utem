import { apiError, requireApiIdentity } from "@/lib/auth/api-access";
import { getPrismaClient } from "@/lib/database/prisma";

const allowed = new Set(["VISTO_BUENO", "APROBADOR", "GESTOR", "TODOS"]);

export async function GET(request: Request) {
  try {
    await requireApiIdentity(request);
    const role = new URL(request.url).searchParams.get("role") ?? "TODOS";
    if (!allowed.has(role)) throw new Error("BAD_REQUEST");
    const users = await getPrismaClient().user.findMany({
      where: { active: true },
      select: { id: true, name: true, email: true, roles: { select: { role: { select: { code: true } } } } },
      orderBy: { name: "asc" },
    });
    return Response.json(users
      .map((user) => ({ id: user.id, name: user.name, email: user.email, roles: user.roles.map((entry) => entry.role.code) }))
      .filter((user) => role === "TODOS" || user.roles.includes(role) || user.roles.includes("ADMIN")));
  } catch (error) { return apiError(error); }
}
