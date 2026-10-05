import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  fallbackBudgetStage,
  normalizeTrackingSnapshot,
  trackingSummary,
  type ProgramTrackingRecord,
} from "../../lib/tracking/program-tracking";

describe("seguimiento de programas", () => {
  it("deriva una etapa útil desde el último presupuesto cuando aún no existe seguimiento manual", () => {
    expect(fallbackBudgetStage("APROBADO", "FINALIZADO")).toBe("APROBADO");
    expect(fallbackBudgetStage("OBSERVADO", "GESTION")).toBe("OBSERVADO");
    expect(fallbackBudgetStage("EN_REVISION", "APROBACION")).toBe("REVISION_VRAF");
    expect(fallbackBudgetStage("EN_REVISION", "VISTO_BUENO")).toBe("REVISION_COMITE");
    expect(fallbackBudgetStage("BORRADOR", "GESTION")).toBe("EN_ELABORACION");
  });

  it("mantiene un aprobado sin enlace como aprobado y documento pendiente", () => {
    const snapshot = normalizeTrackingSnapshot({ budgetStage: "APROBADO", memoNumber: "257/2026", approvalUrl: "" }, "NO_INICIADO");
    expect(snapshot.budgetStage).toBe("APROBADO");
    expect(snapshot.memoNumber).toBe("257/2026");
    expect(snapshot.approvalUrl).toBe("");
  });

  it("resume aprobaciones, revisión VRAF, elaboración y observaciones", () => {
    const base = {
      academicStatus: "RECIBIDO" as const,
      priority: "MEDIA" as const,
      note: "",
      responsible: "",
      memoNumber: "",
      approvalDate: "",
      approvalUrl: "",
      code: "X",
      name: "Programa",
      type: "MAGISTER_PROFESIONAL" as const,
      faculty: "Facultad",
      director: "Director",
      currentCohort: "2027-1S",
      latestBudgetStatus: null,
      latestWorkflowStage: null,
      updatedAt: "",
      updatedByName: "",
    };
    const records: ProgramTrackingRecord[] = [
      { ...base, programId: "1", budgetStage: "APROBADO" },
      { ...base, programId: "2", budgetStage: "REVISION_VRAF" },
      { ...base, programId: "3", budgetStage: "EN_ELABORACION" },
      { ...base, programId: "4", budgetStage: "OBSERVADO" },
    ];
    expect(trackingSummary(records)).toEqual({ total: 4, approved: 1, vraf: 1, drafting: 1, observed: 1 });
  });

  it("persiste el seguimiento como snapshot auditable y mantiene Drive fuera de D1", () => {
    const route = readFileSync("app/api/program-tracking/route.ts", "utf8");
    const page = readFileSync("app/seguimiento/page.tsx", "utf8");
    const shell = readFileSync("components/AppShell.tsx", "utf8");

    expect(route).toContain("'ProgramTracking'");
    expect(route).toContain("UPDATE_PROGRAM_TRACKING");
    expect(route).toContain("AuditLog");
    expect(page).toContain("Enlace a Google Drive");
    expect(page).toContain("La plataforma guarda sólo el enlace y la trazabilidad");
    expect(shell).toContain('["/seguimiento", "Seguimiento de programas"');
  });
});
