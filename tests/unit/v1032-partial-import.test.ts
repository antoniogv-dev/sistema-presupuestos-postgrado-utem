import { describe, expect, it } from "vitest";
import { analyzeBudgetFile, pendingImportedBudgetFields } from "@/lib/import/budget-file-import";

describe("v10.32 importación parcial de presupuestos", () => {
  it("infiere el año inicial desde la primera anualidad reconocida y no bloquea por estudiantes faltantes", async () => {
    const file = new File([
      JSON.stringify({
        budget: {
          startSemester: 2,
          annualOverrides: [
            { year: 2027, annualTuition: 4_000_000, centralOverheadRate: 0.2, facultyOverheadRate: 0.1 },
            { year: 2028, annualTuition: 4_000_000, centralOverheadRate: 0.2, facultyOverheadRate: 0.1 },
          ],
        },
      }),
    ], "presupuesto-parcial.json", { type: "application/json" });

    const analysis = await analyzeBudgetFile(file);

    expect(analysis.startYear).toBe(2027);
    expect(analysis.startSemester).toBe(2);
    expect(analysis.inferences.some((item) => item.includes("Año de inicio inferido"))).toBe(true);
    expect(analysis.warnings.some((item) => item.includes("año de inicio"))).toBe(false);
    expect(pendingImportedBudgetFields(analysis)).toEqual(["Duración del programa", "Estudiantes iniciales"]);
  });

  it("mantiene identificados los faltantes que deben completarse después de crear el Borrador", async () => {
    const file = new File([JSON.stringify({ budget: {} })], "sin-identificacion.json", { type: "application/json" });
    const analysis = await analyzeBudgetFile(file);

    expect(pendingImportedBudgetFields(analysis)).toEqual([
      "Año de inicio",
      "Semestre de inicio",
      "Duración del programa",
      "Estudiantes iniciales",
    ]);
    expect(analysis.warnings.some((item) => item.includes("importación parcial seguirá habilitada"))).toBe(true);
  });
});
