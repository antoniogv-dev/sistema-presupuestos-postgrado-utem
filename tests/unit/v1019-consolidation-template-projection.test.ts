import { describe, expect, it } from "vitest";
import { buildConsolidationGroups, budgetsForConsolidationGroup } from "@/lib/calculations/consolidation";
import { demoBudgets, institutionalParameters } from "@/lib/demo-data";
import { projectAnnualValues, resolveAnnualTemplateValue } from "@/lib/templates/annual-projection";

describe("v10.19 consolidación institucional por estado", () => {
  it("excluye borradores y reemplazados del consolidado activo", () => {
    const groups = buildConsolidationGroups(demoBudgets, institutionalParameters);
    const active = groups.find((group) => group.id === "institutional-active");
    expect(active).toBeDefined();
    expect(active?.budgetCount).toBe(3);
    const selected = budgetsForConsolidationGroup(demoBudgets, active!);
    expect(selected.map((budget) => budget.status).sort()).toEqual(["Aprobado", "Aprobado", "En revisión"].sort());
    expect(selected.some((budget) => budget.status === "Borrador")).toBe(false);
  });

  it("genera un consolidado institucional exclusivo de aprobados", () => {
    const groups = buildConsolidationGroups(demoBudgets, institutionalParameters);
    const approved = groups.find((group) => group.id === "institutional-approved");
    expect(approved).toBeDefined();
    expect(approved?.budgetCount).toBe(2);
    const selected = budgetsForConsolidationGroup(demoBudgets, approved!);
    expect(selected.length).toBeGreaterThan(0);
    expect(selected.every((budget) => budget.status === "Aprobado")).toBe(true);
  });

  it("los consolidados por programa tampoco suman borradores", () => {
    const groups = buildConsolidationGroups(demoBudgets, institutionalParameters);
    const mgp = groups.find((group) => group.id === "program-mgp");
    expect(mgp?.budgetCount).toBe(1);
  });
});

describe("v10.19 valor base manual y reajuste anual", () => {
  it("permite reemplazar el valor inicial y proyectar los años siguientes", () => {
    const projected = projectAnnualValues([2027, 2028, 2029, 2030], 2027, 3_000_000, 0.05, {
      2027: 2_000_000,
      2028: 2_100_000,
      2029: 2_205_000,
      2030: 2_315_250,
    });
    expect(projected[2027]).toBe(3_000_000);
    expect(projected[2028]).toBe(3_150_000);
    expect(projected[2029]).toBe(3_307_500);
    expect(projected[2030]).toBe(3_472_875);
  });

  it("resuelve años futuros desde el valor base incluso cuando no existe valor anual explícito", () => {
    expect(resolveAnnualTemplateValue({
      parameter: "ASISTENCIA",
      values: { 2027: 3_000_000 },
      baseYear: 2027,
      baseValue: 3_000_000,
      annualAdjustmentRate: 0.05,
    }, 2029)).toBe(3_307_500);
  });
});
