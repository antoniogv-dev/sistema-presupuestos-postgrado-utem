import { describe, expect, it } from "vitest";
import { calculateBudget } from "@/lib/calculations/budget-engine";
import { demoBudget, institutionalParameters } from "@/lib/demo-data";
import { createFinancialReportPdf } from "@/lib/export/pdf";
import { buildFinancialNarrative } from "@/lib/export/financial-narrative";
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
      "Valor hora docencia sincrónica",
      "Valor hora docencia de reemplazo",
      "Dirección aplicada al presupuesto",
      "Asistencia aplicada al presupuesto",
      "Estudiantes activos",
      "Horas docentes presenciales",
    ]) {
      expect(parameters.rows.some((row) => row.parameter === parameter)).toBe(true);
    }
    expect(parameters.rows.some((row) => row.parameter === "Valor hora docencia presencial")).toBe(false);
    expect(parameters.rows.some((row) => row.parameter === "Valor hora docencia sincrónica")).toBe(true);
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

    for (const sheetName of ["Presupuesto completo", "Flujo presupuestario", "Parámetros completos", "Parámetros anuales", "Parámetros semestrales", "Descuentos", "Costos e ingresos"]) {
      expect(text).toContain(sheetName);
    }
    expect(text).toContain("xl/worksheets/sheet7.xml");
    expect(text).toContain("PARÁMETROS COMPLETOS UTILIZADOS EN EL CÁLCULO");
    expect(text).toContain("Duración oficial del programa");
    expect(text).toContain("Dirección aplicada al presupuesto");
    expect(text).toContain("Estudiantes activos");
    expect(text).toContain("Costos y gastos registrados");
  });

  it("muestra subtotales obligatorios y subtotales condicionales sólo cuando existen", () => {
    const emptyBudget = clone(demoBudget);
    emptyBudget.scholarshipsEnabled = false;
    emptyBudget.manualItems = emptyBudget.manualItems.filter((item) => !["Equipamiento", "Becas y ayudas", "Becas de manutención"].includes(item.category));
    const emptyReport = buildFinancialReport(emptyBudget, calculateBudget(emptyBudget, institutionalParameters));
    for (const label of ["HONORARIOS ACADÉMICOS (SUBTOTAL)", "HONORARIOS NO ACADÉMICOS (SUBTOTAL)", "OTROS GASTOS (SUBTOTAL)"]) {
      expect(emptyReport.rows.some((row) => row.label === label)).toBe(true);
    }
    expect(emptyReport.rows.some((row) => row.label === "EQUIPAMIENTOS (SUBTOTAL)")).toBe(false);
    expect(emptyReport.rows.some((row) => row.label === "BECAS Y AYUDAS (SUBTOTAL)")).toBe(false);

    const withConditional = clone(emptyBudget);
    withConditional.manualItems.push(
      { id: "eq", name: "Equipo", description: "", category: "Equipamiento", year: 2027, amount: 100000, costType: "Único de esta versión", periodicity: "Único" },
      { id: "aid", name: "Ayuda", description: "", category: "Becas y ayudas", year: 2027, amount: 50000, costType: "Único de esta versión", periodicity: "Único" },
    );
    const conditionalReport = buildFinancialReport(withConditional, calculateBudget(withConditional, institutionalParameters));
    expect(conditionalReport.rows.some((row) => row.label === "EQUIPAMIENTOS (SUBTOTAL)")).toBe(true);
    expect(conditionalReport.rows.some((row) => row.label === "BECAS Y AYUDAS (SUBTOTAL)")).toBe(true);
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
    const narrative = buildFinancialNarrative(budget, result, institutionalParameters);
    const bytes = createFinancialReportPdf(financial, parameters, {
      jpegBytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
      imageWidth: 10,
      imageHeight: 10,
      title: budget.program.name,
      subtitle: `Versión ${budget.programVersionLabel}\nCohorte ${budget.startYear}-${budget.startSemester}S`,
    }, narrative);
    const text = new TextDecoder("latin1").decode(bytes);

    expect(text).toContain("/Subtype /Image");
    expect(text).toContain("/DCTDecode");
    expect(text).toContain(budget.program.name);
    expect(text).toContain("Análisis financiero y principales consideraciones");
    expect(text).toContain("Parámetros principales utilizados");
    expect(text).toContain("/MediaBox [0 0 595 842]");
  });
});
