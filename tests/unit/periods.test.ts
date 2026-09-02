import { describe, expect, it } from "vitest";
import {
  getActivePeriods,
  getActiveYears,
  getAnnualEnrollmentChargePeriods,
  getAnnualTuitionChargePeriods,
  getTuitionFactorForYear,
} from "@/lib/calculations/periods";

describe("periodos activos", () => {
  it("no muestra años anteriores al inicio", () => {
    const periods = getActivePeriods(2028, 2, 4);
    expect(getActiveYears(periods)).toEqual([2028, 2029, 2030]);
    expect(getActiveYears(periods)).not.toContain(2027);
  });

  it("prorratea 0,5; 1,0; 0,5", () => {
    const periods = getActivePeriods(2027, 2, 4);
    expect(getTuitionFactorForYear(periods, 2027)).toBe(0.5);
    expect(getTuitionFactorForYear(periods, 2028)).toBe(1);
    expect(getTuitionFactorForYear(periods, 2029)).toBe(0.5);
  });

  it("reconoce arancel en el tercer año calendario cuando la cohorte inicia en 2S", () => {
    expect(getAnnualTuitionChargePeriods(2026, 2, 4)).toEqual([
      { year: 2026, semester: 2, index: 0 },
      { year: 2027, semester: 1, index: 1 },
      { year: 2028, semester: 1, index: 3 },
    ]);
  });

  it("mantiene la matrícula anual por bloques de dos semestres", () => {
    expect(getAnnualEnrollmentChargePeriods(2026, 2, 4)).toEqual([
      { year: 2026, semester: 2, index: 0 },
      { year: 2027, semester: 2, index: 2 },
    ]);
  });
});
