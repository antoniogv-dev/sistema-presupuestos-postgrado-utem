import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "Sistema de Presupuestos de Postgrado UTEM",
    timestamp: new Date().toISOString(),
  });
}
