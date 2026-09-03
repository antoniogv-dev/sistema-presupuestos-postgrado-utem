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

  it("cobra matrícula anual completa por bloque de dos semestres sin partir estudiantes por año calendario", () => {
    const download = source("lib/export/download.ts");
    const normalizer = source("lib/export/institutional-budget-enrollment-normalizer.ts");

    expect(download).toContain("normalizeInstitutionalAnnualEnrollment(bytes, budget, result, parameters)");
    expect(normalizer).toContain("getAnnualEnrollmentChargePeriods");
    expect(normalizer).toContain("getAnnualTuitionChargePeriods");
    expect(normalizer).toContain("Los estudiantes no se prorratean por 0,5");
    expect(normalizer).not.toContain("activeStudents) * 0.5");
    expect(normalizer).not.toContain("discount.students) * 0.5");
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