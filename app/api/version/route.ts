export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    ok: true,
    app: "Sistema de Presupuestos de Postgrado UTEM",
    version: "1.0.16-d1-web",
    release: "v10.6",
    loginResponseTypingFix: true,
  });
}
