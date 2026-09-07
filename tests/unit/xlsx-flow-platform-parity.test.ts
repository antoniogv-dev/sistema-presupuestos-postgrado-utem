import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "lib/export/institutional-budget-break-even-formula.ts"), "utf8");

describe("XLSX institucional · paridad con plataforma", () => {
  it("usa BudgetResult como fuente autoritativa de las filas de FLUJO TOTAL", () => {
    for (const marker of [
      "flow.grossEnrollmentFee",
      "flow.tuitionAfterBenefits",
      "-flow.badDebt",
      "flow.recognizedEnrollmentFee",
      "-flow.directTeachingCost",
      "-flow.replacementTeachingCost",
      "-flow.thesisGuidanceCost",
      "-flow.direction",
      "-flow.assistance",
      "-flow.otherNonAcademicHonoraria",
      "-flow.centralOverhead",
      "-flow.facultyOverhead",
    ]) expect(source).toContain(marker);
  });

  it("recalcula cada subtotal visible desde filas alimentadas por el motor", () => {
    for (const marker of [
      "SUM(${col}5:${col}7)",
      "SUM(${col}9:${col}11)",
      "SUM(${col}13:${col}16)",
      "SUM(${col}18:${col}19)",
      "SUM(${col}23:${col}24)",
      "SUM(${col}30:${col}31)",
      "SUM(${col}35:${col}36)",
      "SUM(${col}12,${col}17,${col}20,${col}22,${col}25,${col}27,${col}29,${col}32,${col}34,${col}37)",
      "+${col}8+${col}38",
    ]) expect(source).toContain(marker);
  });

  it("no vuelve a depender de Costo Directo de Docencia ni Prorrateo Staff para el flujo principal", () => {
    const authoritativeBlock = source.slice(source.indexOf("// INGRESOS."), source.indexOf("files.set(totalSheetName"));
    expect(authoritativeBlock).not.toContain("'Costo Directo de Docencia'!");
    expect(authoritativeBlock).not.toContain("'Prorrateo Staff'!");
    expect(authoritativeBlock).not.toContain("Parámetros!");
  });
});
