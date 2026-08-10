import { cookies } from "next/headers";
import { hashSessionToken } from "@/lib/auth/password";
import { d1Database } from "@/lib/runtime-env";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get("utem_budget_session")?.value;
  if (token) {
    const tokenHash = await hashSessionToken(token);
    try {
      await d1Database().prepare(`DELETE FROM "UserSession" WHERE "tokenHash" = ?`).bind(tokenHash).run();
    } catch {
      // La cookie se elimina incluso si D1 no está disponible temporalmente.
    }
  }
  cookieStore.set("utem_budget_session", "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  return Response.json({ ok: true });
}
