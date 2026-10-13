import { describe, expect, it } from "vitest";
import { buildDashboardOffer2027 } from "@/lib/integrations/dashboard-offer-2027";
import { calculateBudget } from "@/lib/calculations/budget-engine";
import { demoBudget, institutionalParameters, secondDemoBudget } from "@/lib/demo-data";

describe("intercambio financiero 2027 con dashboard", () => {
  it("exporta únicamente cohortes 2027 sin información identificable de estudiantes", () => {
    const budget = structuredClone(demoBudget);
    budget.status = "Aprobado";
    const payload = buildDashboardOffer2027([budget, secondDemoBudget], institutionalParameters, "2026-10-13T00:00:00Z");
    expect(payload.programs).toHaveLength(1);
    expect(payload.format).toBe("UTEM_POSTGRAD_BUDGET_DASHBOARD");
    expect(payload.tuitionBasis).toBe("PROGRAM_TOTAL");
    expect(JSON.stringify(payload)).not.toContain("rut");
    expect(payload.programs[0].ready).toBe(true);
    expect(payload.programs[0].equivalentBreakEven).toBeGreaterThan(0);
    expect(payload.programs[0].breakEven).toBeCloseTo(
      payload.programs[0].equivalentBreakEven! * payload.programs[0].tuition, -1,
    );
    const expectedTarget = calculateBudget(budget, institutionalParameters).annualFlows
      .reduce((sum, flow) => sum + flow.tuitionAfterBenefits, 0);
    expect(payload.programs[0].target).toBe(Math.round(expectedTarget));
    expect(payload.programs[0].projectedStudents).toBe(budget.initialStudents);
    expect("seats" in payload.programs[0]).toBe(false);
  });

  it("no autoriza automáticamente cohortes 2S antiguas con tercera anualidad", () => {
    const budget = structuredClone(demoBudget);
    budget.status = "Aprobado";
    budget.startSemester = 2;
    budget.cohortName = "MGP 2027-2S";
    const payload = buildDashboardOffer2027([budget], institutionalParameters);
    expect(payload.programs[0].ready).toBe(false);
    expect(payload.programs[0].warnings.join(" ")).toContain("normalizar");
  });

  it("exige resolver cohortes duplicadas de un mismo programa", () => {
    const budget = structuredClone(demoBudget);
    budget.status = "Aprobado";
    const other = structuredClone(budget);
    other.id = "cohorte-2s";
    other.startSemester = 2;
    other.tuitionPricingMode = "PROGRAM_TOTAL";
    other.programTotalTuition = 8_000_000;
    const payload = buildDashboardOffer2027([budget, other], institutionalParameters);
    expect(payload.programs).toHaveLength(2);
    expect(payload.programs.every(program => !program.ready)).toBe(true);
  });
});
