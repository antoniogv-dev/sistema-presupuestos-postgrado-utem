import { cookies } from "next/headers";
import { z } from "zod";
import { ensureBootstrapAdministrator } from "@/lib/auth/api-access";
import { createSessionToken, hashSessionToken, verifyPassword } from "@/lib/auth/password";
import { d1Id, runD1Batch } from "@/lib/database/d1-atomic";
import { getPrismaClient } from "@/lib/database/prisma";
import { d1Database } from "@/lib/runtime-env";

const loginSchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8).max(200),
});

const SESSION_SECONDS = 8 * 60 * 60;

export async function POST(request: Request) {
  try {
    const input = loginSchema.parse(await request.json());
    let user = await getPrismaClient().user.findUnique({
      where: { email: input.email },
      include: { roles: { include: { role: true } } },
    });
    // Si el correo coincide con BOOTSTRAP_ADMIN_EMAIL, se reconcilian nombre y rol ADMIN
    // antes de validar la contraseña. Esto evita que un registro histórico deje al administrador sin acceso.
    const bootstrap = await ensureBootstrapAdministrator(input.email);
    if (bootstrap) user = bootstrap;
    if (!user || !user.active || !user.passwordHash || !user.passwordSalt || !user.passwordIterations) {
      return Response.json({ error: "Correo o contraseña incorrectos." }, { status: 401 });
    }

    const valid = await verifyPassword(input.password, user.passwordHash, user.passwordSalt, user.passwordIterations);
    if (!valid) return Response.json({ error: "Correo o contraseña incorrectos." }, { status: 401 });

    const token = createSessionToken();
    const tokenHash = await hashSessionToken(token);
    const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000);
    const database = d1Database();
    await runD1Batch([
      database.prepare(`DELETE FROM "UserSession" WHERE "userId" = ? OR "expiresAt" <= CURRENT_TIMESTAMP`).bind(user.id),
      database.prepare(`
        INSERT INTO "UserSession" ("id", "userId", "tokenHash", "expiresAt", "createdAt")
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).bind(d1Id("session"), user.id, tokenHash, expiresAt.toISOString()),
    ]);

    const cookieStore = await cookies();
    cookieStore.set("utem_budget_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_SECONDS,
    });

    return Response.json({
      userId: user.id,
      email: user.email,
      name: user.name,
      roles: user.roles.map((assignment) => assignment.role.code),
    });
  } catch {
    return Response.json({ error: "No fue posible iniciar sesión." }, { status: 400 });
  }
}
