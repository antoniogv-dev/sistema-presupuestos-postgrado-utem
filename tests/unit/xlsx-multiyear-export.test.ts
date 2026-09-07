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

  it("v13.0.7 realinea FLUJO TOTAL, materializa la fila 42 y usa matrícula reconocida del motor", () => {
    const download = source("lib/export/download.ts");
    const patch = source("lib/export/institutional-budget-break-even-formula.ts");

    expect(download).toContain('import { alignInstitutionalBreakEvenFormula } from "./institutional-budget-break-even-formula"');
    expect(download).toContain("alignInstitutionalBreakEvenFormula(bytes, budget, result, parameters)");
    expect(patch).toContain("for (let row = 41; row >= 7; row -= 1)");
    expect(patch).toContain('shiftFlowCellDown(totalFlow, "A", row, row + 1)');
    expect(patch).toContain('setText(totalFlow, "A7", "Reconocimiento de Matrícula")');
    expect(patch).toContain("shiftFlowCellDown(totalFlow, col, row, row + 1)");
    expect(patch).toContain("const sourceRow = sheetXml.match(rowPattern(row - 1))");
    expect(patch).toContain("setNumber(totalFlow, `${col}7`, flow.recognizedEnrollmentFee)");
    expect(patch).toContain("SUM(${col}5:${col}7)");
    expect(patch).toContain('"Asistencia técnica "');
    expect(patch).not.toContain("necesaria para crear ${ref}");
  });

  it("v13.0.7 no desplaza referencias externas y reconstruye todos los subtotales desde BudgetResult", () => {
    const patch = source("lib/export/institutional-budget-break-even-formula.ts");

    // Regresión MGDAP: FLUJO TOTAL ya no depende de fórmulas externas de Parámetros
    // para guía de tesis ni docencia; toma los valores autoritativos del mismo BudgetResult de la plataforma.
    expect(patch).not.toContain("shiftLocalFormulaRows");
    expect(patch).not.toContain("Parámetros!$${col}$8");
    expect(patch).not.toContain("const graduationStudentsRow = 6 + discountSlots");
    expect(patch).toContain("setNumber(totalFlow, `${col}9`, -flow.directTeachingCost)");
    expect(patch).toContain("setNumber(totalFlow, `${col}10`, -flow.replacementTeachingCost)");
    expect(patch).toContain("setNumber(totalFlow, `${col}11`, -flow.thesisGuidanceCost)");

    // La jerarquía de subtotales replica la estructura validada de Ciencia de Datos y Trabajo Social.
    expect(patch).toContain("SUM(${col}9:${col}11)");
    expect(patch).toContain("SUM(${col}13:${col}16)");
    expect(patch).toContain("SUM(${col}18:${col}19)");
    expect(patch).toContain("SUM(${col}23:${col}24)");
    expect(patch).toContain("SUM(${col}30:${col}31)");
    expect(patch).toContain("SUM(${col}35:${col}36)");
    expect(patch).toContain("SUM(${col}12,${col}17,${col}20,${col}22,${col}25,${col}27,${col}29,${col}32,${col}34,${col}37)");
    expect(patch).toContain("+${col}8+${col}38");
    expect(patch).toContain("+${previousCol}41");
    expect(patch).toContain("IFERROR((${col}8+${col}38)/${col}8,0)");
  });

  it("v13.0.7 usa la misma identidad operacional de la plataforma y evita LET/@", () => {
    const patch = source("lib/export/institutional-budget-break-even-formula.ts");

    expect(patch).toContain("38:${lastYearColumn}38");
    expect(patch).toContain("37:${lastYearColumn}37");
    expect(patch).toContain("11:${lastYearColumn}11");
    expect(patch).toContain("7:${lastYearColumn}7");
    expect(patch).toContain("const formula = `IFERROR(");
    expect(patch).toContain("setNumber(totalFlow, `${col}7`, flow.recognizedEnrollmentFee)");
    expect(patch).not.toContain("const recognition = clampRate(budget.enrollmentRecognitionRate)");
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
