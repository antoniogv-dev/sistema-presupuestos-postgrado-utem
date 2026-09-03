import { describe, expect, it } from "vitest";
import { enrollmentChargePeriodsForBudget, enrollmentFeeForPeriod } from "@/lib/calculations/billing";
import type { CohortBudget } from "@/lib/calculations/types";

function budget(mode: "ANNUAL" | "SEMESTER" | "SINGLE_SPECIAL"): CohortBudget {
  return {
    startYear: 2026,
    startSemester: 2,
    durationSemesters: 4,
    enrollmentBillingMode: mode,
    singleEnrollmentFee: 300_000,
    semesterEnrollmentFee: 120_000,
  } as CohortBudget;
}

describe("modalidades parametrizables de matrícula", () => {
  it("ANNUAL cobra una matrícula completa cada dos semestres desde el ingreso", () => {
    expect(enrollmentChargePeriodsForBudget(budget("ANNUAL"))).toEqual([
      { year: 2026, semester: 2, index: 0 },
      { year: 2027, semester: 2, index: 2 },
    ]);
    expect(enrollmentFeeForPeriod(budget("ANNUAL"), 2026, 2, 192_150)).toBe(192_150);
    expect(enrollmentFeeForPeriod(budget("ANNUAL"), 2027, 1, 201_758)).toBe(0);
  });

  it("SEMESTER cobra el valor completo en cada semestre activo", () => {
    expect(enrollmentChargePeriodsForBudget(budget("SEMESTER"))).toEqual([
      { year: 2026, semester: 2, index: 0 },
      { year: 2027, semester: 1, index: 1 },
      { year: 2027, semester: 2, index: 2 },
      { year: 2028, semester: 1, index: 3 },
    ]);
    expect(enrollmentFeeForPeriod(budget("SEMESTER"), 2027, 1, 999_999)).toBe(120_000);
    expect(enrollmentFeeForPeriod(budget("SEMESTER"), 2027, 2, 999_999)).toBe(120_000);
  });

  it("SINGLE_SPECIAL representa una matrícula única o total al inicio del programa", () => {
    expect(enrollmentChargePeriodsForBudget(budget("SINGLE_SPECIAL"))).toEqual([
      { year: 2026, semester: 2, index: 0 },
    ]);
    expect(enrollmentFeeForPeriod(budget("SINGLE_SPECIAL"), 2026, 2, 999_999)).toBe(300_000);
    expect(enrollmentFeeForPeriod(budget("SINGLE_SPECIAL"), 2027, 1, 999_999)).toBe(0);
  });
});
