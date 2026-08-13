import { describe, expect, it } from "vitest";
import { calculateBudget } from "@/lib/calculations/budget-engine";
import { demoBudget, institutionalParameters } from "@/lib/demo-data";
import { createFinancialReportPdf } from "@/lib/export/pdf";
import { buildFinancialReport, buildParameterReport } from "@/lib/export/report-model";
import { createFinancialReportXlsx } from "@/lib/export/xlsx";

const clone = <T,>(value: T): T => structuredClone(value);

describe("exportación trazable de parámetros", () => {
  it("incluye parámetros efectivos, estudiantes, descuentos, ingresos y costos", () => {
    const budget = clone(demoBudget);
    const result = calculateBudget(budget, institutionalParameters);
    const parameters = buildParameterReport(budget, result, institutionalParameters);

    expect(parameters.rows.some((row) => row.parameter === "Valor hora docencia directa")).toBe(true);
    expect(parameters.rows.some((row) => row.parameter === "Estudiantes activos")).toBe(true);
    expect(parameters.rows.some((row) => row.section === "Descuentos de arancel" && row.parameter.includes("Convenio institucional"))).toBe(true);
    expect(parameters.rows.some((row) => row.section === "Ingresos extraordinarios" && row.parameter.includes("Aporte asociado a convenio"))).toBe(true);
    expect(parameters.rows.some((row) => row.section === "Costos y gastos registrados" && row.parameter.includes("Textos y publicaciones"))).toBe(true);
  });

  it("agrega una segunda hoja de parámetros al XLSX individual", () => {
    const budget = clone(demoBudget);
    const result = calculateBudget(budget, institutionalParameters);
    const financial = buildFinancialReport(budget, result);
    const parameters = buildParameterReport(budget, result, institutionalParameters);
    const bytes = createFinancialReportXlsx(financial, parameters);
    const text = new TextDecoder().decode(bytes);

    expect(text).toContain("Parámetros utilizados");
    expect(text).toContain("xl/worksheets/sheet2.xml");
    expect(text).toContain("Valor hora docencia directa");
    expect(text).toContain("Estudiantes activos");
  });

  it("agrega páginas de parámetros al PDF individual", () => {
    const budget = clone(demoBudget);
    const result = calculateBudget(budget, institutionalParameters);
    const financial = buildFinancialReport(budget, result);
    const parameters = buildParameterReport(budget, result, institutionalParameters);
    const bytes = createFinancialReportPdf(financial, parameters);
    const text = new TextDecoder("latin1").decode(bytes);

    expect(text).toContain("Parámetros utilizados");
    expect(text).toContain("Valor hora docencia directa");
    expect(text).toContain("Estudiantes activos");
  });
});
