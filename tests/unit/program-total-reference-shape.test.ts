import { describe, expect, it } from "vitest";
import { demoBudget, institutionalParameters } from "../../lib/demo-data";
import { calculateBudget } from "../../lib/calculations/budget-engine";
import { institutionalBudgetForExport } from "../../lib/export/institutional-budget-program-total";

describe("forma anual del arancel total en cohorte 2S", () => {
  it("mantiene 25% / 50% / 25% en cuatro semestres con distribución uniforme", () => {
    const budget = structuredClone(demoBudget);
    budget.startSemester = 2;
    budget.durationSemesters = 4;
    budget.tuitionPricingMode = "PROGRAM_TOTAL";
    budget.programTotalTuition = 6_000_000;
    budget.tuitionDistributionMode = "CUSTOM";
    budget.tuitionSemesterDistribution = [0.25, 0.25, 0.25, 0.25];

    const result = calculateBudget(budget, institutionalParameters);
    const adapted = institutionalBudgetForExport(budget, result, institutionalParameters);
    const exportedUnits = result.annualFlows.map((flow) => {
      const annual = adapted.annualOverrides.find((item) => item.year === flow.year)!;
      return annual.annualTuition * flow.tuitionFactor;
    });

    expect(exportedUnits).toEqual([1_500_000, 3_000_000, 1_500_000]);
  });
});