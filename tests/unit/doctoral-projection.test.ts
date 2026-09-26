import { describe, expect, it } from "vitest";
import {
  academicYearForBudgetYear,
  buildDoctoralRegimeProjection,
  summarizeDoctoralProgramYear,
} from "@/lib/calculations/doctoral-projection";
import { doctorateDemoBudget, institutionalParameters } from "@/lib/demo-data";

const clone = <T,>(value: T): T => structuredClone(value);

describe("proyección doctoral anual y en régimen", () => {
  it("identifica el año académico de una cohorte doctoral", () => {
    expect(academicYearForBudgetYear(doctorateDemoBudget, 2026)).toBe(1);
    expect(academicYearForBudgetYear(doctorateDemoBudget, 2027)).toBe(2);
    expect(academicYearForBudgetYear(doctorateDemoBudget, 2028)).toBe(3);
    expect(academicYearForBudgetYear(doctorateDemoBudget, 2029)).toBe(4);
  });

  it("consolida las cohortes activas sin perder su trazabilidad", () => {
    const first = clone(doctorateDemoBudget);
    first.id = "docmip-2026";
    first.startYear = 2026;
    first.cohortName = "DOCMIP 2026";

    const second = clone(doctorateDemoBudget);
    second.id = "docmip-2027";
    second.startYear = 2027;
    second.cohortName = "DOCMIP 2027";
    second.semesters = second.semesters.map((semester) => ({ ...semester, year: semester.year + 1 }));

    const summary = summarizeDoctoralProgramYear(first.program, [first, second], institutionalParameters, 2027);
    expect(summary.cohorts).toHaveLength(2);
    expect(summary.cohorts.map((row) => row.cohortYear)).toEqual([2026, 2027]);
    expect(summary.direction).toBeGreaterThan(0);
    expect(summary.totalExpenses).toBeGreaterThan(0);
  });

  it("construye cuatro etapas simultáneas para la proyección en régimen", () => {
    const projection = buildDoctoralRegimeProjection(
      doctorateDemoBudget.program,
      [doctorateDemoBudget],
      institutionalParameters,
      2027,
    );
    expect(projection).not.toBeNull();
    expect(projection!.stages).toHaveLength(4);
    expect(projection!.stages.map((stage) => stage.academicYear)).toEqual([1, 2, 3, 4]);
    expect(projection!.stages.filter((stage) => stage.eligibleForCongressesInternships).map((stage) => stage.academicYear)).toEqual([3, 4]);
  });

  it("mantiene un único monto anual de Dirección y de Congresos/Pasantías en régimen", () => {
    const projection = buildDoctoralRegimeProjection(
      doctorateDemoBudget.program,
      [doctorateDemoBudget],
      institutionalParameters,
      2027,
    )!;
    const expectedDirection = institutionalParameters.byProgramType.DOCTORADO.annualDirection[2027];
    const expectedCongresses = institutionalParameters.byProgramType.DOCTORADO.congressesInternships[2027];

    expect(projection.direction).toBeCloseTo(expectedDirection, -1);
    expect(projection.congressesInternships).toBeCloseTo(expectedCongresses, -1);
    expect(projection.stages[0].flow.congressesInternships).toBe(0);
    expect(projection.stages[1].flow.congressesInternships).toBe(0);
    expect(projection.stages[2].flow.congressesInternships).toBeGreaterThan(0);
    expect(projection.stages[3].flow.congressesInternships).toBeGreaterThan(0);
  });
});
