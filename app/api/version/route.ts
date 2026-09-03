export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    ok: true,
    app: "Sistema de Presupuestos de Postgrado UTEM",
    version: "2.1.2-d1-web",
    release: "v12.1.2",
    loginResponseTypingFix: true,
  });
}
