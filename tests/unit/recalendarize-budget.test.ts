import { describe, expect, it } from "vitest";
import { grossTuitionPerStudentForProgram } from "@/lib/calculations/billing";
import { calculateBudget, resolvedAnnualOverrideForYear } from "@/lib/calculations/budget-engine";
import { recalendarizeCohortBudget } from "@/lib/budgets/recalendarize";
import { demoBudget, institutionalParameters } from "@/lib/demo-data";

const original = () => structuredClone(demoBudget);
const changeTo2S = { startYear: 2027, startSemester: 2 as const, durationSemesters: 4, initialStudents: 15 };

describe("recalendarización de una cohorte profesional de cuatro semestres", () => {
  it("conserva precio total, estudiantes, descuentos y carga por semestre", () => {
    const budget = original();
    budget.semesters.forEach((period, index) => {
      period.directTeachingHours = (index + 1) * 36;
      period.activeStudents = 15 - index;
    });
    const expectedPrice = grossTuitionPerStudentForProgram(
      budget, (year) => resolvedAnnualOverrideForYear(budget, institutionalParameters, year).annualTuition,
    );
    const copy = structuredClone(budget);
    const moved = recalendarizeCohortBudget(budget, institutionalParameters, changeTo2S);

    expect(budget).toEqual(copy);
    expect(moved.tuitionPricingMode).toBe("PROGRAM_TOTAL");
    expect(moved.programTotalTuition).toBe(expectedPrice);
    expect(moved.semesters.map((period) => [period.year, period.semester])).toEqual([
      [2027, 2], [2028, 1], [2028, 2], [2029, 1],
    ]);
    expect(moved.semesters.map((period) => period.directTeachingHours)).toEqual([36, 72, 108, 144]);
    expect(moved.semesters.map((period) => period.activeStudents)).toEqual([15, 14, 13, 12]);
    expect(moved.discounts[0]).toMatchObject({ startYear: 2027, startSemester: 2, endYear: 2029, endSemester: 1 });
    expect(moved.externalIncome[0]).toMatchObject({ year: 2028, semester: 2 });
    expect(moved.manualItems[0]).toMatchObject({ year: 2028, semester: 2 });
    expect(moved.manualItems[1]).toMatchObject({ year: 2027, periodicity: "Anual" });
    expect(moved.annualOverrides.map((item) => item.year)).toEqual([2027, 2028, 2029]);
    expect(calculateBudget(moved, institutionalParameters).pricing.programTotalTuition).toBe(expectedPrice);
  });

  it("prorratea dirección, asistencia y honorarios continuos 50%-100%-50%", () => {
    const budget = original();
    budget.annualOverrides = [2027, 2028].map((year) => ({
      ...resolvedAnnualOverrideForYear(budget, institutionalParameters, year),
      annualOtherNonAcademicHonoraria: year === 2027 ? 1_000_000 : 1_050_000,
    }));
    const moved = recalendarizeCohortBudget(budget, institutionalParameters, changeTo2S);
    expect(moved.annualOverrides.map((item) => item.directionAllocationRate)).toEqual([0.5, 1, 0.5]);
    expect(moved.annualOverrides.map((item) => item.assistanceAllocationRate)).toEqual([0.5, 1, 0.5]);
    expect(moved.annualOverrides.map((item) => item.otherNonAcademicAllocationRate)).toEqual([0.5, 1, 0.5]);
    expect(moved.annualOverrides[2].annualOtherNonAcademicHonoraria).toBe(1_102_500);

    const flows = calculateBudget(moved, institutionalParameters).annualFlows;
    moved.annualOverrides.forEach((annual, index) => {
      expect(flows[index].direction).toBeCloseTo(annual.annualDirection * annual.directionAllocationRate, 4);
      expect(flows[index].assistance).toBeCloseTo(annual.annualAssistance * annual.assistanceAllocationRate, 4);
    });
  });

  it("respeta prorrateos manuales de otras cohortes", () => {
    const budget = original();
    budget.annualOverrides[0].directionProrated = true;
    budget.annualOverrides[0].directionAllocationRate = 0.3;
    const moved = recalendarizeCohortBudget(budget, institutionalParameters, changeTo2S);
    expect(moved.annualOverrides[0].directionAllocationRate).toBe(0.3);
    expect(moved.annualOverrides[0].directionProrated).toBe(true);
    expect(moved.annualOverrides[0].assistanceAllocationRate).toBe(0.5);
  });

  it("normaliza una cohorte 2S existente de manera explícita e idempotente", () => {
    const first = recalendarizeCohortBudget(original(), institutionalParameters, changeTo2S);
    const storedLegacy = { ...first, tuitionPricingMode: "ANNUAL_LEGACY" as const };
    const normalized = recalendarizeCohortBudget(storedLegacy, institutionalParameters, { ...changeTo2S, normalizeExisting: true });
    const again = recalendarizeCohortBudget(normalized, institutionalParameters, { ...changeTo2S, normalizeExisting: true });
    expect(normalized.tuitionPricingMode).toBe("PROGRAM_TOTAL");
    expect(normalized.annualOverrides.map((annual) => annual.directionAllocationRate)).toEqual([0.5, 1, 0.5]);
    expect(again).toEqual(normalized);
  });

  it("rescata descuentos completos que un presupuesto 2S antiguo dejó con fechas 1S", () => {
    const moved = recalendarizeCohortBudget(original(), institutionalParameters, changeTo2S);
    const legacy = {
      ...moved,
      tuitionPricingMode: "ANNUAL_LEGACY" as const,
      discounts: [{ ...moved.discounts[0], startYear: 2027, startSemester: 1 as const, endYear: 2028, endSemester: 2 as const }],
    };
    const legacyPrice = calculateBudget(legacy, institutionalParameters).pricing.programTotalTuition;
    const normalized = recalendarizeCohortBudget(legacy, institutionalParameters, { ...changeTo2S, normalizeExisting: true });
    expect(normalized.discounts[0]).toMatchObject({ startYear: 2027, startSemester: 2, endYear: 2029, endSemester: 1 });
    expect(calculateBudget(normalized, institutionalParameters).pricing.programTotalTuition).toBeLessThan(legacyPrice);
  });

  it("al volver al primer semestre restaura el año completo de staff y mantiene el arancel", () => {
    const moved = recalendarizeCohortBudget(original(), institutionalParameters, changeTo2S);
    const back = recalendarizeCohortBudget(moved, institutionalParameters, {
      startYear: 2027, startSemester: 1, durationSemesters: 4, initialStudents: 15,
    });
    expect(back.programTotalTuition).toBe(moved.programTotalTuition);
    expect(back.annualOverrides.map((annual) => annual.directionAllocationRate)).toEqual([1, 1]);
    expect(back.discounts[0]).toMatchObject({ startYear: 2027, startSemester: 1, endYear: 2028, endSemester: 2 });
  });

  it("no modifica retroactivamente un presupuesto aprobado si no se edita", () => {
    const approved = original();
    approved.status = "Aprobado";
    const initial = calculateBudget(approved, institutionalParameters);
    recalendarizeCohortBudget(structuredClone(approved), institutionalParameters, changeTo2S);
    expect(calculateBudget(approved, institutionalParameters)).toEqual(initial);
  });
});
