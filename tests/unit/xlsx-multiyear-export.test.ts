import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

describe("exportación XLSX multianual", () => {
  it("no bloquea presupuestos de 3 o más años cuando la plantilla institucional no es compatible", () => {
    const download = source("lib/export/download.ts");

    expect(download).toContain("const compatibilityIssue = institutionalTemplateCompatibilityIssue(budget, result)");
    expect(download).toContain("if (!compatibilityIssue)");
    expect(download).toContain("createFinancialReportXlsx(report, parameterReport)");
    expect(download).not.toContain("if (compatibilityIssue) throw new Error(compatibilityIssue)");
  });

  it("el XLSX general construye columnas de acuerdo con todos los años del reporte", () => {
    const xlsx = source("lib/export/xlsx.ts");

    expect(xlsx).toContain("report.years.length + 1");
    expect(xlsx).toContain("report.years");
  });
});
