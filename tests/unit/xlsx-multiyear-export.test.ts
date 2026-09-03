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
    expect(download).toContain("downloadGeneralBudgetXlsx(budget, result, parameters)");
    expect(download).not.toContain("if (compatibilityIssue) throw new Error(compatibilityIssue)");
  });

  it("usa fallback general si la plantilla institucional falla durante la generación", () => {
    const download = source("lib/export/download.ts");

    expect(download).toContain("try {");
    expect(download).toContain("catch {");
    expect(download).toContain("Si la plantilla institucional falla, se continúa con el XLSX general trazable");
  });

  it("mantiene una firma Promise<void> compatible con los consumidores de exportación", () => {
    const download = source("lib/export/download.ts");

    expect(download).toContain("): Promise<void> {");
    expect(download).not.toContain("Promise<BudgetXlsxDownloadResult>");
  });

  it("el XLSX general construye columnas de acuerdo con todos los años del reporte", () => {
    const xlsx = source("lib/export/xlsx.ts");

    expect(xlsx).toContain("report.years.length + 1");
    expect(xlsx).toContain("report.years");
  });
});
