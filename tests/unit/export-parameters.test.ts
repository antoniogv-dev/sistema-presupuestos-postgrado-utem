import { describe, expect, it } from "vitest";
import { calculateBudget } from "@/lib/calculations/budget-engine";
import { demoBudget, institutionalParameters } from "@/lib/demo-data";
import { createFinancialReportPdf } from "@/lib/export/pdf";
import { buildFinancialReport, buildParameterReport, compactParameterReportForPdf } from "@/lib/export/report-model";
import { createFinancialReportXlsx } from "@/lib/export/xlsx";

const clone = <T,>(value: T): T => structuredClone(value);

describe("exportación trazable de parámetros", () => {
  it("construye una fotografía completa de parámetros para Excel", () => {
    const budget = clone(demoBudget);
    const result = calculateBudget(budget, institutionalParameters);
    const parameters = buildParameterReport(budget, result, institutionalParameters);

    for (const parameter of [
      "Duración oficial del programa",
      "Valor hora docencia directa",
      "Valor hora docencia de reemplazo",
      "Dirección aplicada al presupuesto",
      "Asistencia aplicada al presupuesto",
      "Estudiantes activos",
      "Horas docentes directas",
    ]) {
      expect(parameters.rows.some((row) => row.parameter === parameter)).toBe(true);
    }
    expect(parameters.rows.some((row) => row.section === "Descuentos de arancel" && row.parameter.includes("Convenio institucional"))).toBe(true);
    expect(parameters.rows.some((row) => row.section === "Ingresos extraordinarios" && row.parameter.includes("Aporte asociado a convenio"))).toBe(true);
    expect(parameters.rows.some((row) => row.section === "Costos y gastos registrados" && row.parameter.includes("Textos y publicaciones"))).toBe(true);
  });

  it("agrega trazabilidad completa y vistas especializadas al XLSX individual", () => {
    const budget = clone(demoBudget);
    const result = calculateBudget(budget, institutionalParameters);
    const financial = buildFinancialReport(budget, result);
    const parameters = buildParameterReport(budget, result, institutionalParameters);
    const bytes = createFinancialReportXlsx(financial, parameters);
    const text = new TextDecoder().decode(bytes);

    for (const sheetName of ["Parámetros completos", "Parámetros anuales", "Parámetros semestrales", "Descuentos", "Costos e ingresos"]) {
      expect(text).toContain(sheetName);
    }
    expect(text).toContain("xl/worksheets/sheet6.xml");
    expect(text).toContain("Duración oficial del programa");
    expect(text).toContain("Dirección aplicada al presupuesto");
    expect(text).toContain("Estudiantes activos");
    expect(text).toContain("Costos y gastos registrados");
  });

  it("reduce el anexo PDF a parámetros principales y valores con información", () => {
    const budget = clone(demoBudget);
    budget.annualOverrides.forEach((row) => { row.annualFoodBeverages = 0; });
    const result = calculateBudget(budget, institutionalParameters);
    const complete = buildParameterReport(budget, result, institutionalParameters);
    const compact = compactParameterReportForPdf(complete);

    expect(compact.rows.length).toBeLessThan(complete.rows.length);
    expect(compact.rows.some((row) => row.parameter === "Programa")).toBe(true);
    expect(compact.rows.some((row) => row.parameter === "Arancel anual por estudiante")).toBe(true);
    expect(compact.rows.some((row) => row.parameter === "Alimentos y bebidas" && row.value === 0)).toBe(false);
  });

  it("genera PDF con portada, flujo y anexo compacto", () => {
    const budget = clone(demoBudget);
    const result = calculateBudget(budget, institutionalParameters);
    const financial = buildFinancialReport(budget, result);
    const parameters = compactParameterReportForPdf(buildParameterReport(budget, result, institutionalParameters));
    const bytes = createFinancialReportPdf(financial, parameters, {
      jpegBytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
      imageWidth: 10,
      imageHeight: 10,
      title: budget.program.name,
      subtitle: `Versión ${budget.programVersionLabel}\nCohorte ${budget.startYear}-${budget.startSemester}S`,
    });
    const text = new TextDecoder("latin1").decode(bytes);

    expect(text).toContain("/Subtype /Image");
    expect(text).toContain("/DCTDecode");
    expect(text).toContain(budget.program.name);
    expect(text).toContain("Parámetros principales utilizados");
  });
});
