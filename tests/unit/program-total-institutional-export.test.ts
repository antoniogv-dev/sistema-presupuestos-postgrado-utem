import { describe, expect, it } from "vitest";
import { demoBudget, institutionalParameters } from "../../lib/demo-data";
import { calculateBudget } from "../../lib/calculations/budget-engine";
import { institutionalBudgetForExport } from "../../lib/export/institutional-budget-program-total";

describe("adaptación PROGRAM_TOTAL al XLSX institucional", () => {
  it("reproduce la participación anual del precio total sin cambiar el presupuesto real", () => {
    const budget = structuredClone(demoBudget);
    budget.tuitionPricingMode = "PROGRAM_TOTAL";
    budget.programTotalTuition = 6_000_000;
    budget.tuitionDistributionMode = "CUSTOM";
    budget.tuitionSemesterDistribution = Array.from(
      { length: budget.durationSemesters },
      () => 1 / budget.durationSemesters,
    );

    const result = calculateBudget(budget, institutionalParameters);
    const adapted = institutionalBudgetForExport(budget, result, institutionalParameters);

    expect(budget.tuitionPricingMode).toBe("PROGRAM_TOTAL");
    expect(adapted.tuitionPricingMode).toBe("ANNUAL_LEGACY");

    for (const flow of result.annualFlows) {
      const annual = adapted.annualOverrides.find((item) => item.year === flow.year);
      expect(annual).toBeDefined();
      const unit = (annual?.annualTuition ?? 0) * flow.tuitionFactor;
      expect(unit).toBeCloseTo(6_000_000 * flow.tuitionDistributionShare, 6);
    }
  });
});