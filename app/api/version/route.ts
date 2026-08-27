export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    ok: true,
    app: "Sistema de Presupuestos de Postgrado UTEM",
    version: "1.1.8-d1-web",
    release: "v11.0.8",
    loginResponseTypingFix: true,
  });
}
