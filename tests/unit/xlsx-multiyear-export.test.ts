import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

describe("exportación XLSX multianual", () => {
  it("conserva la plantilla institucional y la extiende cuando existen 3 o más años", () => {
    const download = source("lib/export/download.ts");

    expect(download).toContain('import { extendInstitutionalBudgetXlsx } from "./institutional-budget-multiyear"');
    expect(download).toContain("const baseResult = result.years.length > 2 ? institutionalBaseResult(result) : result");
    expect(download).toContain("institutionalTemplateCompatibilityIssue(budget, baseResult)");
    expect(download).toContain("createInstitutionalFormulaBudgetXlsx(template, budget, baseResult, parameters)");
    expect(download).toContain("extendInstitutionalBudgetXlsx(bytes, budget, result, parameters)");
  });

  it("no sustituye un Magíster Profesional compatible por un formato general no validado", () => {
    const download = source("lib/export/download.ts");

    expect(download).not.toContain("Si la plantilla institucional falla, se continúa con el XLSX general trazable");
    expect(download).toContain("if (compatibilityIssue) throw new Error(compatibilityIssue)");
    expect(download).toContain("Los modelos que históricamente no usan la plantilla institucional mantienen su XLSX trazable general");
  });

  it("agrega los años posteriores en las mismas hojas institucionales", () => {
    const multiyear = source("lib/export/institutional-budget-multiyear.ts");

    expect(multiyear).toContain("extendParametersSheet");
    expect(multiyear).toContain("extendStudentFlowSheet");
    expect(multiyear).toContain("extendDirectTeachingSheet");
    expect(multiyear).toContain("extendTotalFlowSheet");
    expect(multiyear).toContain("No genera un formato alternativo");
  });

  it("recompone el punto de equilibrio hasta la última columna anual activa", () => {
    const multiyear = source("lib/export/institutional-budget-multiyear.ts");
    const institutional = source("lib/export/institutional-budget-xlsx.ts");

    expect(institutional).toContain("yearColumnsOrLastColumn: string[] | string");
    expect(institutional).toContain("const yearColumns = Array.isArray(yearColumnsOrLastColumn)");
    expect(institutional).toContain("SUM('FLUJO TOTAL'!${firstYearColumn}37:${lastYearColumn}37)");
    expect(multiyear).toContain("result.years.map((_year, index) => yearColumn(index))");
    expect(multiyear).toContain("calculateBreakEvenEquivalentEnrollments(budget, parameters)");
  });

  it("respeta matrícula anual, semestral o única sin partir estudiantes por año calendario", () => {
    const download = source("lib/export/download.ts");
    const normalizer = source("lib/export/institutional-budget-enrollment-normalizer.ts");

    expect(download).toContain("normalizeInstitutionalEnrollmentBilling(bytes, budget, result, parameters)");
    expect(normalizer).toContain("enrollmentChargePeriodsForBudget");
    expect(normalizer).toContain("enrollmentFeeForPeriod");
    expect(normalizer).toContain("Ninguna modalidad divide estudiantes por 0,5");
    expect(normalizer).not.toContain("activeStudents) * 0.5");
    expect(normalizer).not.toContain("discount.students) * 0.5");
  });

  it("extiende Prorrateo Staff a cada año activo adicional, incluido un último semestre parcial", () => {
    const download = source("lib/export/download.ts");
    const staff = source("lib/export/institutional-budget-staff-multiyear.ts");

    expect(download).toContain('import { extendInstitutionalStaffProration } from "./institutional-budget-staff-multiyear"');
    expect(download).toContain("extendInstitutionalStaffProration(bytes, budget, result, parameters)");
    expect(staff).toContain("const extraYears = result.years.length - 2");
    expect(staff).toContain("2028 (1S)");
    expect(staff).toContain("activeSemesterLabel");
    expect(staff).toContain("Otras cohortes / versiones / programas / proyectos");
    expect(staff).toContain("'Prorrateo Staff'!F");
  });

  it("mantiene una firma Promise<void> compatible con los consumidores de exportación", () => {
    const download = source("lib/export/download.ts");

    expect(download).toContain("): Promise<void> {");
    expect(download).not.toContain("Promise<BudgetXlsxDownloadResult>");
  });

  it("el XLSX general continúa disponible para modelos que no usan la plantilla profesional", () => {
    const xlsx = source("lib/export/xlsx.ts");

    expect(xlsx).toContain("report.years.length + 1");
    expect(xlsx).toContain("report.years");
  });
});
