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
    expect(download).toContain("institutionalTemplateCompatibilityIssue(exportBudget, baseResult)");
    expect(download).toContain("createInstitutionalFormulaBudgetXlsx(template, exportBudget, baseResult, parameters)");
    expect(download).toContain("extendInstitutionalBudgetXlsx(bytes, exportBudget, result, parameters)");
  });

  it("no sustituye un Magíster Profesional compatible por un formato general no validado", () => {
    const download = source("lib/export/download.ts");

    expect(download).not.toContain("Si la plantilla institucional falla, se continúa con el XLSX general trazable");
    expect(download).toContain("if (compatibilityIssue) throw new Error(compatibilityIssue)");
    expect(download).toContain("Los modelos que históricamente no usan la plantilla institucional mantienen su XLSX trazable general");
  });

  it("v13.0.3 mantiene PROGRAM_TOTAL dentro del formato institucional", () => {
    const download = source("lib/export/download.ts");
    const adapter = source("lib/export/institutional-budget-program-total.ts");

    expect(download).not.toContain('budget.tuitionPricingMode !== "PROGRAM_TOTAL"');
    expect(download).toContain("const exportBudget = institutionalBudgetForExport(budget, result, parameters)");
    expect(download).toContain("normalizeInstitutionalProgramTotalTuition(bytes, budget, result)");
    expect(adapter).toContain('tuitionPricingMode: "ANNUAL_LEGACY"');
    expect(adapter).toContain("budget.programTotalTuition ?? 0");
    expect(adapter).toContain("flow.tuitionDistributionShare");
    expect(adapter).toContain("`${yearColumn(index)}4`");
  });

  it("agrega los años posteriores en las mismas hojas institucionales", () => {
    const multiyear = source("lib/export/institutional-budget-multiyear.ts");

    expect(multiyear).toContain("extendParametersSheet");
    expect(multiyear).toContain("extendStudentFlowSheet");
    expect(multiyear).toContain("extendDirectTeachingSheet");
    expect(multiyear).toContain("extendTotalFlowSheet");
    expect(multiyear).toContain("No genera un formato alternativo");
  });

  it("mantiene matrícula parametrizable y prorrateo de staff del modelo de referencia", () => {
    const download = source("lib/export/download.ts");

    expect(download).toContain('import { normalizeInstitutionalEnrollmentBilling } from "./institutional-budget-enrollment-normalizer"');
    expect(download).toContain('import { extendInstitutionalStaffProration } from "./institutional-budget-staff-multiyear"');
    expect(download).toContain("normalizeInstitutionalEnrollmentBilling(bytes, exportBudget, result, parameters)");
    expect(download).toContain("extendInstitutionalStaffProration(bytes, exportBudget, result, parameters)");
  });

  it("v13.0.2 realinea FLUJO TOTAL con el formato MEES de referencia sin cambiar estilos", () => {
    const download = source("lib/export/download.ts");
    const patch = source("lib/export/institutional-budget-break-even-formula.ts");

    expect(download).toContain('import { alignInstitutionalBreakEvenFormula } from "./institutional-budget-break-even-formula"');
    expect(download).toContain("alignInstitutionalBreakEvenFormula(bytes, budget, result, parameters)");
    expect(patch).toContain("for (let row = 41; row >= 7; row -= 1)");
    expect(patch).toContain("shiftFlowCellDown(totalFlow, col, row, row + 1)");
    expect(patch).toContain("`${col}7`, `${col}4*${recognition}`");
    expect(patch).toContain("SUM(${col}5:${col}7)");
    expect(patch).toContain('"Asistencia técnica "');
  });

  it("v13.0.2 usa la misma identidad operacional en Excel y evita LET/@", () => {
    const patch = source("lib/export/institutional-budget-break-even-formula.ts");

    expect(patch).toContain("38:${lastYearColumn}38");
    expect(patch).toContain("37:${lastYearColumn}37");
    expect(patch).toContain("11:${lastYearColumn}11");
    expect(patch).toContain("7:${lastYearColumn}7");
    expect(patch).toContain("const formula = `IFERROR(");
    expect(patch).toContain("const recognition = clampRate(budget.enrollmentRecognitionRate)");
    expect(patch).not.toContain("`LET(");
    expect(patch).not.toContain("@LET");
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