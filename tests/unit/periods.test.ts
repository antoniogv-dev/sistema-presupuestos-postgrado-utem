import { describe, expect, it } from "vitest";
import { getActivePeriods, getActiveYears, getTuitionFactorForYear } from "@/lib/calculations/periods";

describe("periodos activos", () => {
  it("no muestra años anteriores al inicio", () => {
    const periods = getActivePeriods(2028, 2, 4);
    expect(getActiveYears(periods)).toEqual([2028, 2029, 2030]);
    expect(getActiveYears(periods)).not.toContain(2027);
  });

  it("cobra un arancel anual completo en cada año calendario activo", () => {
    const periods = getActivePeriods(2027, 2, 4);
    expect(getTuitionFactorForYear(periods, 2027)).toBe(1);
    expect(getTuitionFactorForYear(periods, 2028)).toBe(1);
    expect(getTuitionFactorForYear(periods, 2029)).toBe(1);
  });
});
